# Configuration

Every setting is an environment variable. The [profile](profiles.md) supplies
defaults for the vocabulary-related ones.

| Variable | Default | |
|---|---|---|
| `DUEPROOF_DATA` | `./data` | Database, uploads, page images, models |
| `DUEPROOF_PROFILE` | `notices_in` | A file in `dueproof/profiles/` |
| `DUEPROOF_LANGUAGES` | from profile | Languages beside English: `hi,ta`, or `all` |
| `DUEPROOF_ORG` | from profile | Your organisation's name, shown in the app |
| `DUEPROOF_TZ` | from profile | Where "today" and "overdue" are decided |
| `DUEPROOF_AUTH` | `local` | `local`, `proxy` or `none`; see [Accounts](accounts-and-sso.md) |
| `DUEPROOF_AUTH_HEADER` | `X-Forwarded-User` | With `proxy`: the header carrying the user's email |
| `DUEPROOF_SESSION_DAYS` | `7` | Session lifetime |
| `DUEPROOF_SECURE_COOKIES` | `1` | `0` only for plain HTTP on a trusted network |
| `DUEPROOF_HOST`, `DUEPROOF_PORT` | `127.0.0.1`, `8000` | Defaults for `dueproof serve` |
| `DUEPROOF_TESSERACT` | found on `PATH` | Path to the Tesseract binary |
| `DUEPROOF_TRANSLATE` | `1` | `0` turns translation off |
| `DUEPROOF_MT_DIR` | `<data>/models/indictrans2` | Translation weights |
| `DUEPROOF_LOG_LEVEL` | `INFO` | |
| `DUEPROOF_SMTP_HOST`, `_PORT`, `_USER`, `_PASSWORD`, `_FROM`, `_STARTTLS` | | Reminder email; see [Workflow](workflow-and-reminders.md) |
| `DUEPROOF_URL` | | Dueproof's public address, for links in digests |

## Fixed limits

80 MB per upload, 300 pages per document, 40 megapixels per rendered page, two
documents processed at a time, 200 sentences per document translated before
analysis. They are constants in `dueproof/config.py` and `dueproof/app.py`.
