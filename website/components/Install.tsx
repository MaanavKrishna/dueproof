/** The install commands from the README, for anyone with Python and Tesseract. */
export function Install() {
  return (
    <div>
      <pre className="terminal" aria-label="Install commands">
        <span className="c"># Needs Python 3.12+ and Tesseract</span>{"\n"}
        git clone https://github.com/MaanavKrishna/dueproof{"\n"}
        cd dueproof{"\n"}
        python3 -m venv .venv{"\n"}
        .venv/bin/pip install -e .{"\n"}
        .venv/bin/dueproof users add you@example.org --admin{"\n"}
        .venv/bin/dueproof serve
      </pre>
      <p className="small muted" style={{ marginTop: 12 }}>
        Then open http://127.0.0.1:8000 and drop in a notice. <code>dueproof doctor</code> checks the setup.
      </p>
    </div>
  );
}
