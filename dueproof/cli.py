"""The `dueproof` command.

    dueproof serve                      run the web app
    dueproof ingest FOLDER              load a folder of PDFs and images
    dueproof users add EMAIL | list | reset EMAIL | disable EMAIL | enable EMAIL
    dueproof backup DIR | verify DIR | restore DIR
    dueproof fetch-model                provision the translation weights (needs network)

Run `dueproof <command> --help` for options. Settings come from DUEPROOF_*
environment variables; see docs/configuration.md.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

def _serve(args) -> int:
    import uvicorn
    print(f"Dueproof on http://{args.host}:{args.port}")
    uvicorn.run("dueproof.app:app", host=args.host, port=args.port, log_level="warning")
    return 0

def _ingest(args) -> int:
    from dueproof import app, db
    from dueproof.config import CHANNELS
    files = sorted(p for p in args.folder.iterdir()
                   if p.suffix.lower() in app.ACCEPTED_SUFFIXES and p.is_file())
    if not files:
        print(f"Nothing to ingest in {args.folder}", file=sys.stderr)
        return 1
    channel = args.channel or CHANNELS[-1]
    t0, failed = time.time(), 0
    for path in files:
        got = app.enqueue(path.name, path, channel, None)
        if got["duplicate"]:
            print(f"   skip  {path.name[:60]:<60} already in the corpus")
            continue
        while (d := db.one("SELECT status, text_source, error FROM documents WHERE id=?",
                           (got["doc_id"],)))["status"] not in ("done", "error"):
            time.sleep(0.25)
        n = db.one("SELECT COUNT(*) c FROM findings WHERE doc_id=?", (got["doc_id"],))["c"]
        failed += d["status"] == "error"
        print(f"  {d['status']:>5}  {path.name[:60]:<60} {d['text_source'] or '-':<6}"
              f" findings={n}" + (f"  ERROR: {d['error']}" if d["error"] else ""))
    print(f"\n{len(files)} file(s) in {time.time() - t0:.1f}s")
    return 1 if failed else 0

def _backup(args) -> int:
    from dueproof import backup
    return backup.main([args.command, str(args.dir)] + (["--force"] if getattr(args, "force", False) else []))

def _password(args, confirm: bool = True) -> str:
    if args.password_stdin:
        return sys.stdin.readline().rstrip("\n")
    import getpass
    pw = getpass.getpass("Password (10+ characters): ")
    if confirm and getpass.getpass("Again: ") != pw:
        raise SystemExit("The passwords did not match")
    return pw

def _users(args) -> int:
    from dueproof import auth, db
    from dueproof.profiles import ROLES
    try:
        if args.action == "list":
            for u in db.q("SELECT * FROM users ORDER BY email"):
                flags = " ".join(f for f, on in (("admin", u["is_admin"]), ("disabled", u["disabled"]),
                                                 ("no-password", not u["pw_hash"])) if on)
                print(f"{u['email']:<36} {u['name'] or '':<24} {u['desk'] or '-':<26} {flags}")
            return 0
        if not args.email:
            raise SystemExit(f"users {args.action} needs an EMAIL")
        if args.action == "add":
            if args.desk and args.desk not in ROLES:
                raise SystemExit(f"Unknown desk {args.desk!r}. Desks: {', '.join(ROLES)}")
            auth.add_user(args.email, args.name or "", args.desk or "",
                          None if args.no_password else _password(args), admin=args.admin)
            print(f"added {args.email}")
        elif args.action == "reset":
            auth.set_password(args.email, _password(args))
            print(f"password changed for {args.email}; their sessions were ended")
        else:
            auth.set_disabled(args.email, args.action == "disable")
            print(f"{args.action}d {args.email}")
        return 0
    except ValueError as exc:
        raise SystemExit(str(exc)) from None
    except Exception as exc:                                    # noqa: BLE001
        if "UNIQUE" in str(exc):
            raise SystemExit(f"{args.email} already exists") from None
        raise

def _fetch_model(args) -> int:
    from dueproof import fetch_model
    return fetch_model.main()

def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="dueproof", description=__doc__.splitlines()[0],
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    from dueproof import __version__
    p.add_argument("--version", action="version", version=f"dueproof {__version__}")
    sub = p.add_subparsers(dest="command", required=True, metavar="command")

    s = sub.add_parser("serve", help="run the web app")
    s.add_argument("--host", default=os.environ.get("DUEPROOF_HOST", "127.0.0.1"))
    s.add_argument("--port", type=int, default=int(os.environ.get("DUEPROOF_PORT", "8000")))
    s.set_defaults(func=_serve)

    s = sub.add_parser("ingest", help="load every PDF and image in a folder (safe to repeat)")
    s.add_argument("folder", type=Path)
    s.add_argument("--channel", help="where these documents came from")
    s.set_defaults(func=_ingest)

    s = sub.add_parser("users", help="manage sign-in accounts")
    s.add_argument("action", choices=["add", "list", "reset", "disable", "enable"])
    s.add_argument("email", nargs="?")
    s.add_argument("--name")
    s.add_argument("--desk", help="the desk this person views by default")
    s.add_argument("--admin", action="store_true")
    s.add_argument("--no-password", action="store_true",
                   help="for proxy sign-in: the account exists only to carry a name and desk")
    s.add_argument("--password-stdin", action="store_true", help="read the password from stdin")
    s.set_defaults(func=_users)

    for name, text in (("backup", "snapshot the database, originals and page images into DIR"),
                       ("verify", "check that a backup in DIR will restore"),
                       ("restore", "restore a verified backup from DIR")):
        s = sub.add_parser(name, help=text)
        s.add_argument("dir", type=Path)
        if name == "restore":
            s.add_argument("--force", action="store_true", help="replace an existing database")
        s.set_defaults(func=_backup)

    s = sub.add_parser("fetch-model", help="download and verify the translation weights")
    s.set_defaults(func=_fetch_model)
    return p

def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    return args.func(args)
