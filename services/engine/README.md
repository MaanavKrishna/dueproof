# Dueproof engine

A stateless Python HTTP service: it reads notices (PDFium text layer, then an
OCR ladder), finds obligations, deadlines and hearings with rules, returns
them as `DateRule`s with verbatim quotes, and locates every quote on its page.
It never touches the database and never calls a model. The contract is
`packages/contracts/src/engine.ts` (Zod); `dueproof_engine/api/models.py`
mirrors it and `tests/test_contract.py` keeps the two in step.

## Run it

```sh
cd services/engine
uv sync                                   # dev env: engine-fast + tesseract rung + test tools
uv run python scripts/fetch_ocr_models.py # PaddleOCR models into models/ppocr (pinned SHA-256)
export ENGINE_SHARED_SECRET=$(openssl rand -hex 32)
export DUEPROOF_ALLOWED_HOSTS=localhost,127.0.0.1   # where the app's signed URLs point
uv run uvicorn dueproof_engine.app:app --port 8000
```

Tests: `uv run python -m unittest discover -s tests -t . -v` (or `uv run pytest`).
Tests needing Tesseract, the OCR models, OpenCV or the translation weights skip
cleanly when those are absent.

## Endpoints

All `POST /v1/*` need `Authorization: Bearer <token>`: an HS256 JWT,
`{"aud": "engine", "exp": <unix seconds>}`, signed with `ENGINE_SHARED_SECRET`
(≥ 32 bytes), expiring within 15 minutes (`ENGINE_TOKEN_MAX_LIFETIME`).
`dueproof_engine/api/auth.py` has `make_token` as the reference. The token is
checked before the request body is read. `GET /health` is open and answers
`{"status": "ok"}`; with a valid token it also reports the version, rungs and
translation. `/openapi.json` needs a token; there is no `/docs` or `/redoc`.

| Endpoint | Does |
|---|---|
| `/v1/inspect` | Fetches `sourceUrl`; sniffs the bytes (the declared `mime` is not trusted); page count, encryption, pages with a usable text layer (≥ 25 words, the same test `/read` uses). Unreadable files answer `ok: false` with `reason` |
| `/v1/read` | Per page: text, words with rects (PDF points from top-left; pixels for image pages) and line ids, engine, confidence, languages. Page images (WebP, 144 DPI) are PUT to `pageImagePutUrls[i]`. `maxRung` caps the OCR ladder; pages still below the confidence bar are listed in `needsEscalation` |
| `/v1/translate` | IndicTrans2 when installed and provisioned (engine-heavy); otherwise `engine: "none"` and the original text. `warn` when the terminology/number check finds something lost |
| `/v1/analyze` | Rule findings for a profile (any shipped profile per request). Deadlines come back as `dueRule` (fixed, or relative with anchor `receipt`/`issue`/`service`/`order`/`hearing`, units `days`/`working_days`/`months`, optional `condonable`), plus `engineDueOn`, the engine's own date for cross-checking only (absent when the anchor date is unknown or the unit is working days). Quotes are verbatim page text in the original language. `translations` are English per line, keyed `"page:line"` where `line` is the 0-based line index in that page's `text` |
| `/v1/link` | Locates quotes on the pages: one rect per line, score 0–1, grade `exact`/`strong`/`approximate`/`unlocated` (unlocated has no page and no rects) |

Errors are JSON `{"error", "reason"?, "message"?}`: 401 `unauthorised`, 413
`too_large` (request body), 422 `unreadable` (`/read` on a bad document;
`reason` is the contract code), 422 `invalid_request`, 502 `storage` (fetch or
PUT failed: retry), 503 `not_configured`. Bodies, URLs and tokens are never
logged, and validation errors never echo input.

Limits (environment): `DUEPROOF_MAX_SOURCE_BYTES` (80 MB, enforced while
streaming), `DUEPROOF_MAX_PAGES` (300), `DUEPROOF_MAX_PAGE_PIXELS` (40 MP
render cap), `DUEPROOF_MAX_IMAGE_PIXELS` (120 MP, checked from the header
before decoding; also Pillow's `MAX_IMAGE_PIXELS`), `DUEPROOF_FETCH_TIMEOUT` /
`DUEPROOF_PUT_TIMEOUT` (30 s), `DUEPROOF_MAX_BODY_BYTES` (20 MB, counted
while the body streams in, so a chunked request is held to it too),
`DUEPROOF_ALLOWED_HOSTS` (storage host allowlist, globs allowed; required:
empty refuses every host unless `DUEPROOF_ALLOW_ANY_HOST=1` or
`ENGINE_AUTH=none` for local development). Only http(s), no redirects.
A host matched by a glob must resolve to public addresses only (no
loopback, private, link-local, CGNAT or IPv6 ULA), and the connection goes to
the address that was checked (no DNS rebinding); an exact entry such as `app`
may be internal. Storage bodies are read raw (`Accept-Encoding: identity`;
any other Content-Encoding is refused), and the fetch and PUT timeouts bound
the whole request. API requests with a `Content-Encoding` get 415, and the
body must arrive within `DUEPROOF_BODY_TIMEOUT` (30 s) or gets 408.

## The OCR ladder (03 §6a)

1. **text_layer** — PDFium via pypdfium2.
2. **paddleocr** — PP-OCR detection + recognition on ONNX Runtime, implemented
   in `dueproof_engine/ocr/paddle.py` with numpy and Pillow only (no OpenCV,
   Shapely, pyclipper or RapidOCR at run time: that is what keeps engine-fast
   small). Word boxes come from the CTC time steps; line boxes are trimmed to
   the ink, calibrated against PDFium's boxes on rendered digital pages.
   Models: **PP-OCRv6 small** det + rec, extracted from the `rapidocr` 3.10.0
   wheel on PyPI by `scripts/fetch_ocr_models.py` (Apache-2.0, Baidu/PaddleOCR
   weights; `MODEL_LICENSES.md` is copied alongside). PP-OCRv5's models live on
   ModelScope/Hugging Face, which this build environment could not reach; any
   PP-OCR det/rec ONNX pair loads (set `DUEPROOF_PADDLE_MODELS`), so v5's
   per-script recognisers (devanagari, ta, te) drop in. The bundled recogniser
   covers Latin/CJK, not Indic scripts: an Indic paragraph is detected, read as
   low-confidence noise, dropped, and pulls the page below the bar.
3. **tesseract** — engine-heavy (`tesseract` group + the binary and packs).
   Packs come from `languages` hints.
4. **vision** — not the engine's: pages in `needsEscalation` go to the AI step.

Page confidence: 1.0 for a text layer; for PaddleOCR the recognition score
averaged over detected text area, unread regions counting as zero; for
Tesseract its mean word confidence. Bar: `DUEPROOF_OCR_CONFIDENCE_BAR` (0.85).
A blank page is confidently empty.

## Deployment shapes

| | engine-fast | engine-heavy / full |
|---|---|---|
| Install | `uv sync --no-default-groups` (base dependencies) | `uv sync --group heavy` (CPU torch first: see Dockerfile) |
| Has | text layer, PaddleOCR, rules, link | + Tesseract, OpenCV, IndicTrans2 |
| Size | site-packages **182 MB** (Python 3.13, linux x86_64, no bytecode) + 30 MB models + 0.7 MB code | n/a (no function limit) |

### engine-fast on Vercel

`api/index.py` exports the ASGI app; `vercel.json` routes everything to it,
fetches the OCR models at build time and excludes tests, fixtures and the
IndicTrans2 code. `requirements.txt` is `uv export --no-default-groups` (base
dependencies only). Set `ENGINE_SHARED_SECRET` in the project; give the
project no other secret (03 §3a). Verify in M0: the unpacked bundle (about
213 MB measured locally) against the 250 MB limit on Vercel's build image,
and cold-start time with the 30 MB of models; the fallback in 03 §3a (models
from R2 into `/tmp`, set `DUEPROOF_PADDLE_MODELS=/tmp/ppocr`) is open.

### Full engine in Docker

`Dockerfile`: multi-stage, non-root (uid 10001), writes only `/tmp`
(`docker run --read-only --tmpfs /tmp ...`), Tesseract with hin/mal/tam packs,
CPU torch + IndicTrans2 code (weights mounted read-only at
`/models/indictrans2`; `--build-arg INSTALL_TRANSLATION=0` for a small image).

## Recorded fixtures

`fixtures/recorded/<fixture>.<endpoint>.json`: the engine's responses to
inspect, read (as engine-fast: `maxRung: "paddleocr"`), analyze (`notices_in`,
`receivedOn: 2026-10-24`) and link over `tests/fixtures/*.pdf`. Regenerate
with `uv run python scripts/record_fixtures.py` and review the diff.

## Tools

- `python -m dueproof_engine.tools.evaluate tests/fixtures/labels.jsonl --docs tests/fixtures`
- `python -m dueproof_engine.tools.model` — fetch and verify IndicTrans2 weights (connected machine, once).
