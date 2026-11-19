"""PDFium in a child process, with hard limits.

PDFium has no budget of its own. A 635-byte PDF whose form draws itself, or a
content stream that inflates to a gigabyte, makes it allocate until the
process aborts (SIGABRT, which no `except` catches), and a text layer of a
million words keeps it busy for a minute. So every PDFium call for /inspect
and /read runs in a child process, one per document:

  * the child's address space may grow by SANDBOX_MEMORY at most, and its CPU
    time is capped at SANDBOX_CPU_SECONDS (RLIMIT_AS, RLIMIT_CPU);
  * each call has a wall-clock limit (SANDBOX_CALL_SECONDS), after which the
    child ends itself (SIGALRM), and the parent stops waiting soon after;
  * a child that dies, runs out or times out is a ReadError("too_large"): the
    document needs more than the engine allows. The parent carries on.

Children come from a small fork server (_Server, its own process, started on
first use) that has already imported PDFium and numpy, so starting one costs
a fork (a few milliseconds), not an interpreter start, and the engine, which
runs threads and OCR models, is never forked itself. It is not
multiprocessing's forkserver: that re-imports the engine's __main__ in every
child, which under a server's bootstrap script is not safe. A child talks to
the engine over a socket pair; nothing needs /dev/shm (absent on AWS Lambda).

The engine no longer calls PDFium, so pdf.LOCK, which serialised every PDF
request in the process, is only taken inside a child: one heavy document
cannot hold up another request.

The child sends back plain data (sizes, words, BGR arrays). It keeps the
document open between calls, so a page is parsed once even when OCR asks for
it again at another DPI.

DUEPROOF_SANDBOX=off runs the same code in-process, without limits; so does
a platform without fork (Windows), with an error in the log.
"""
from __future__ import annotations

import atexit
import logging
import math
import os
import signal
import socket
import struct
import subprocess
import sys
import threading
from multiprocessing.connection import Connection

import numpy as np
import pypdfium2 as pdfium

from dueproof_engine import config
from dueproof_engine.pipeline import pdf
from dueproof_engine.pipeline.pdf import ReadError

try:
    import resource
except ImportError:                     # Windows: no fork either, so the sandbox is off there
    resource = None

log = logging.getLogger("dueproof.sandbox")

TOO_COMPLEX = "This document needs more memory or time to read than the engine allows"


class PageError(Exception):
    """One page PDFium could not load (a broken page tree, a page object it
    rejects). The rest of the document may be fine."""


# The child's side.
class Worker:
    """The PDFium work for one document. Runs in the child; in-process when
    the sandbox is off."""

    def __init__(self):
        self.doc: pdfium.PdfDocument | None = None
        self.page_no: int | None = None
        self.page_obj: pdfium.PdfPage | None = None
        self.chars = 0

    def open(self, source, password: str | None) -> dict:
        self.doc = pdf.open_pdf(source, password)
        with pdf.LOCK:
            return {"pages": len(self.doc), "encrypted": pdf.is_encrypted(self.doc)}

    def _page(self, pno: int) -> pdfium.PdfPage:
        """Page `pno` (0-based), kept open until another page is asked for."""
        if self.page_no != pno:
            self._close_page()
            with pdf.LOCK:
                try:
                    self.page_obj = self.doc[pno]
                except pdfium.PdfiumError as exc:
                    raise PageError(str(exc)) from exc
            self.page_no = pno
        return self.page_obj

    def page(self, pno: int, dpi: int | None) -> dict:
        """A page's size, rotation and text layer, and its image at `dpi`
        (none when dpi is None). The text layer is read before the page is
        rendered: a text bomb is refused without drawing it."""
        page = self._page(pno)
        try:
            with pdf.LOCK:
                size, rotation = pdf.page_size(page), page.get_rotation()
            layer = pdf.words(page)
            self.chars += sum(len(w["text"]) for w in layer)
            if self.chars > config.MAX_DOCUMENT_CHARS:
                raise ReadError("too_large", f"This document has more than {config.MAX_DOCUMENT_CHARS} "
                                             "characters of text")
            image = pdf.render(page, dpi) if dpi else None
        except pdfium.PdfiumError as exc:
            raise PageError(str(exc)) from exc
        return {"size": size, "rotation": rotation, "words": layer, "image": image}

    def render(self, pno: int, dpi: int):
        try:
            return pdf.render(self._page(pno), dpi)
        except pdfium.PdfiumError as exc:
            raise PageError(str(exc)) from exc

    def _close_page(self) -> None:
        if self.page_obj is not None:
            with pdf.LOCK:
                self.page_obj.close()
        self.page_obj, self.page_no = None, None

    def close(self) -> None:
        self._close_page()
        if self.doc is not None:
            with pdf.LOCK:
                self.doc.close()
            self.doc = None


def _run(worker: Worker, op: str, args: tuple) -> tuple:
    """One call, as the reply the parent understands."""
    try:
        return ("ok", getattr(worker, op)(*args))
    except ReadError as exc:
        return ("read_error", exc.reason, str(exc))
    except PageError as exc:
        return ("page_error", str(exc))
    except MemoryError:
        return ("read_error", "too_large", TOO_COMPLEX)
    except Exception as exc:                # a binding's own error on a strange page or file
        if op == "open":
            return ("read_error", "malformed", "This file could not be read as a PDF")
        return ("page_error", type(exc).__name__)


class _Array:
    """Stands in for an array in a pickled reply; its bytes follow raw. A
    300 DPI page is 26 MB, and pickling it costs several times sending it."""

    def __init__(self, shape: tuple, dtype: str):
        self.shape, self.dtype = shape, dtype


def _send(conn: Connection, reply: tuple) -> None:
    arrays: list[np.ndarray] = []

    def pull(value):
        if isinstance(value, np.ndarray):
            arrays.append(np.ascontiguousarray(value))
            return _Array(value.shape, value.dtype.str)
        return value

    if reply[0] == "ok":
        value = reply[1]
        value = {k: pull(v) for k, v in value.items()} if isinstance(value, dict) else pull(value)
        reply = ("ok", value)
    conn.send(reply)
    for arr in arrays:
        conn.send_bytes(memoryview(arr).cast("B"))


def _receive(conn: Connection) -> tuple:
    reply = conn.recv()

    def push(value):
        if isinstance(value, _Array):
            buf = bytearray(int(np.prod(value.shape)) * np.dtype(value.dtype).itemsize)
            conn.recv_bytes_into(buf)
            return np.frombuffer(buf, value.dtype).reshape(value.shape)
        return value

    if reply[0] == "ok":
        value = reply[1]
        value = {k: push(v) for k, v in value.items()} if isinstance(value, dict) else push(value)
        reply = ("ok", value)
    return reply


def _vsize() -> int:
    """This process's address space now, in bytes (0 where /proc is absent)."""
    try:
        with open("/proc/self/statm") as f:
            return int(f.read().split()[0]) * resource.getpagesize()
    except (OSError, ValueError, IndexError, AttributeError):
        return 0


def _limit(memory: int, cpu: int) -> None:
    """Hard limits for this (child) process. The memory limit is on top of
    what the fork server had already mapped (Python, numpy and PDFium), so it
    measures what the document costs. macOS does not enforce RLIMIT_AS; the
    CPU and wall-clock limits still hold there."""
    for name, value in (("RLIMIT_CORE", (0, 0)),           # a PDFium abort leaves no core file
                        ("RLIMIT_AS", (_vsize() + memory,) * 2 if memory else None),
                        ("RLIMIT_CPU", (cpu, cpu + 5) if cpu else None)):
        if value is None or not hasattr(resource, name):
            continue
        try:
            resource.setrlimit(getattr(resource, name), value)
        except (ValueError, OSError):
            pass


def _serve(conn: Connection) -> None:
    """The child: take its limits, then answer calls until the parent says
    stop or goes away. SIGALRM's default action ends the process, even inside
    PDFium, so a call over its time cannot outlive it."""
    memory, cpu, call_seconds = conn.recv()
    _limit(memory, cpu)
    worker = Worker()
    try:
        while True:
            try:
                msg = conn.recv()
            except (EOFError, OSError):
                break
            if msg is None:
                break
            signal.alarm(max(1, math.ceil(call_seconds)))
            reply = _run(worker, *msg)
            signal.alarm(0)
            _send(conn, reply)
    finally:
        worker.close()
        conn.close()


def _tiny_pdf() -> bytes:
    """One page of text in the standard fonts, built here (no file on disk)."""
    fonts = b"".join(b"/F%d << /Type /Font /Subtype /Type1 /BaseFont /%s >> " % (i, name)
                     for i, name in enumerate((b"Helvetica", b"Times-Roman", b"Courier",
                                               b"Helvetica-Bold", b"Arial,Bold"), 1))
    text = b"BT " + b"".join(b"/F%d 12 Tf 72 %d Td (Notice 0123456789) Tj " % (i, 700 - 20 * i)
                             for i in range(1, 6)) + b"ET"
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << " + fonts
            + b">> >> /Contents 4 0 R >>",
            b"<< /Length %d >>\nstream\n%s\nendstream" % (len(text), text)]
    out, offsets = bytearray(b"%PDF-1.7\n"), []
    for n, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n%s\nendobj\n" % (n, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def _warm_pdfium() -> None:
    """Read and draw a page once, so PDFium has listed the system's fonts and
    filled its caches before the first fork: every child inherits them
    instead of paying for them per document."""
    try:
        worker = Worker()
        worker.open(_tiny_pdf(), None)
        worker.page(0, 72)
        worker.close()
    except Exception:                                       # warming is only an optimisation
        pass


def _fork_server(ctrl_fd: int) -> None:
    """The fork server's loop (its own process, started by _Server). Each
    request carries one end of a socket pair; the server forks a child to
    serve it and answers with the child's pid. It exits when the engine does."""
    ctrl = socket.socket(fileno=ctrl_fd)
    signal.signal(signal.SIGCHLD, signal.SIG_IGN)          # the kernel reaps the children
    _warm_pdfium()
    while True:
        try:
            msg, fds, _, _ = socket.recv_fds(ctrl, 16, 1)
        except OSError:
            break
        if not msg:
            break                                           # the engine has gone
        if not fds:
            continue
        try:
            pid = os.fork()
        except OSError:
            os.close(fds[0])
            ctrl.sendall(struct.pack("<i", -1))
            continue
        if pid == 0:
            try:
                ctrl.close()
                signal.signal(signal.SIGCHLD, signal.SIG_DFL)
                _serve(Connection(fds[0]))
            finally:
                os._exit(0)
        os.close(fds[0])
        ctrl.sendall(struct.pack("<i", pid))


# The parent's side.
def _supported() -> bool:
    return hasattr(os, "fork") and hasattr(socket, "send_fds") and hasattr(socket, "AF_UNIX")


class _Server:
    """The fork server: a small process that imports PDFium and numpy once
    and forks a child per document. It is not a fork of the engine (which
    runs threads and OCR models), and it never sees a document itself."""

    def __init__(self):
        self.lock = threading.Lock()
        self.proc: subprocess.Popen | None = None
        self.ctrl: socket.socket | None = None

    def _start(self) -> None:
        mine, theirs = socket.socketpair()
        paths = [p or os.getcwd() for p in sys.path]
        env = {**os.environ, "PYTHONPATH": os.pathsep.join(dict.fromkeys(paths)),
               "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"}
        self.proc = subprocess.Popen(
            [sys.executable, "-c", "import sys; from dueproof_engine.pipeline.sandbox import "
                                   "_fork_server; _fork_server(int(sys.argv[1]))", str(theirs.fileno())],
            pass_fds=[theirs.fileno()], env=env, stdin=subprocess.DEVNULL)
        theirs.close()
        self.ctrl = mine

    def stop(self) -> None:
        if self.ctrl is not None:
            self.ctrl.close()
        if self.proc is not None:
            try:
                self.proc.wait(2)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        self.proc = self.ctrl = None

    def fork(self) -> tuple[Connection, int]:
        """A connection to a new child, and its pid."""
        with self.lock:
            for attempt in (1, 2):
                if self.proc is None or self.proc.poll() is not None:
                    self.stop()
                    self._start()
                mine, theirs = socket.socketpair()
                try:
                    socket.send_fds(self.ctrl, [b"f"], [theirs.fileno()])
                    got = b""
                    while len(got) < 4:
                        if not (chunk := self.ctrl.recv(4 - len(got))):
                            raise ConnectionError("the fork server has gone")
                        got += chunk
                except OSError:
                    mine.close()
                    self.stop()                             # restart it once, then give up
                    if attempt == 2:
                        raise
                    continue
                finally:
                    theirs.close()
                pid = struct.unpack("<i", got)[0]
                if pid < 0:
                    mine.close()
                    raise OSError("the fork server could not fork")
                return Connection(mine.detach()), pid
        raise AssertionError("unreachable")


_SERVER = _Server()
atexit.register(_SERVER.stop)
_warned = False


class Sandbox:
    """One document's child process. Use as a context manager:

        with Sandbox() as sb:
            info = sb.call("open", data, password)
            page = sb.call("page", 0, 144)
    """

    def __init__(self, memory: int | None = None, cpu: int | None = None,
                 call_seconds: float | None = None):
        self.memory = config.SANDBOX_MEMORY if memory is None else memory
        self.cpu = config.SANDBOX_CPU_SECONDS if cpu is None else cpu
        self.call_seconds = config.SANDBOX_CALL_SECONDS if call_seconds is None else call_seconds
        self.local = config.SANDBOX == "off"
        self.conn: Connection | None = None
        self.pid = 0
        self.worker = Worker() if self.local else None

    def __enter__(self) -> "Sandbox":
        global _warned
        if self.local:
            return self
        try:
            if not _supported():
                raise OSError("no fork or no descriptor passing")
            self.conn, self.pid = _SERVER.fork()
            self.conn.send((self.memory, self.cpu, self.call_seconds))
        except OSError as exc:
            # A platform that cannot fork at all (Windows). Reading without
            # limits beats not reading; say so, once.
            if not _warned:
                log.error("sandbox: no child process (%s); PDFium runs in-process with no memory "
                          "or time limit", exc)
                _warned = True
            self.local, self.worker, self.conn = True, Worker(), None
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def call(self, op: str, *args):
        """Run `op` in the child. Raises ReadError (the child's, or
        "too_large" if the child died or ran out of time) or PageError."""
        if self.local:
            with pdf.LOCK:
                reply = _run(self.worker, op, args)
        else:
            reply = self._remote(op, args)
        if reply[0] == "ok":
            return reply[1]
        if reply[0] == "page_error":
            raise PageError(reply[1])
        raise ReadError(reply[1], reply[2])

    def _remote(self, op: str, args: tuple) -> tuple:
        if self.conn is None:                               # an earlier call ended the child
            raise ReadError("too_large", TOO_COMPLEX)
        try:
            self.conn.send((op, args))
            if self.conn.poll(self.call_seconds + 5):       # the child's own alarm fires first
                return _receive(self.conn)
            why = "no answer in time"
            try:
                os.kill(self.pid, signal.SIGKILL)
            except OSError:
                pass
        except (EOFError, OSError):                         # out of memory or CPU time, or killed
            why = "the child ended"
        log.warning("sandbox: %s refused: %s", op, why)
        self.conn.close()
        self.conn = None
        raise ReadError("too_large", TOO_COMPLEX)

    def close(self) -> None:
        if self.local:
            self.worker.close()
            return
        if self.conn is not None:
            try:
                self.conn.send(None)
            except OSError:
                pass
            self.conn.close()
            self.conn = None


def warm() -> None:
    """Start the fork server now rather than on the first document."""
    if config.SANDBOX != "off" and _supported():
        with Sandbox():
            pass
