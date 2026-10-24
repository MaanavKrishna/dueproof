# Deployment

Dueproof is one Python process and a data folder. Put a TLS-terminating proxy in
front of it and back up the data folder.

## systemd

```bash
sudo useradd --system --home /var/lib/dueproof --create-home dueproof
sudo python3 -m venv /opt/dueproof/.venv
sudo /opt/dueproof/.venv/bin/pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
sudo /opt/dueproof/.venv/bin/pip install /path/to/dueproof
sudo cp deploy/dueproof.service /etc/systemd/system/
sudo systemctl enable --now dueproof
sudo -u dueproof DUEPROOF_DATA=/var/lib/dueproof /opt/dueproof/.venv/bin/dueproof users add you@example.org --admin
```

`deploy/dueproof.service` keeps Dueproof on `127.0.0.1:8000` with a hardened
sandbox. `deploy/dueproof-digest.timer` sends reminder digests on weekday
mornings; put SMTP settings in `/etc/dueproof/smtp.env`.

## Docker Compose with HTTPS

```bash
DUEPROOF_DOMAIN=dueproof.example.org docker compose up -d
docker compose exec dueproof dueproof users add you@example.org --admin
```

`compose.yaml` runs Dueproof behind Caddy, which obtains and renews the
certificate. Mount the translation weights at `/data/models/indictrans2` if you
use them.

## A proxy you already run

Forward to `127.0.0.1:8000`, allow request bodies of at least 85 MB, and pass
the original Host. For example, nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    client_max_body_size 85m;
}
```

## Backups

```bash
dueproof backup /mnt/backups          # safe while running
dueproof verify /mnt/backups/dueproof-20261024-083000
dueproof restore /mnt/backups/dueproof-20261024-083000   # stop the app first
```

A backup is the database (copied with SQLite's online backup API), the uploaded
originals and the page images. `verify` checks the database's integrity, that
every original still hashes to what was recorded at ingest, and that every page
image is present; `restore` verifies before writing and will not overwrite an
existing database without `--force`. A backup you have not restored is not a
backup: test a restore into a spare folder (`DUEPROOF_DATA=/tmp/restore-test`).

## Operating it

- `GET /health` — liveness, queue depth, document counts, translation state.
- Logs go to stderr, one line per request with a request id that also appears
  in the `X-Request-ID` response header and the audit trail.
- A document caught mid-processing by a restart is picked up again at start-up.
- Limits: 80 MB per upload, 300 pages per document, 40 megapixels per rendered
  page. Two documents are processed at a time.
- One server, SQLite: comfortable for a team and tens of thousands of documents.
  There is no clustering or failover.
