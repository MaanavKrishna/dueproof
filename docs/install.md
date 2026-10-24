# Install

## With Python

Dueproof needs Python 3.12 or newer and Tesseract.

```bash
git clone https://github.com/MaanavKrishna/dueproof && cd dueproof
```

```bash
python3 -m venv .venv && .venv/bin/pip install -e .
```

On Linux, install the CPU build of PyTorch first to avoid a multi-gigabyte GPU
download:

```bash
.venv/bin/pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
```

### Tesseract

| System | Command |
|---|---|
| macOS | `brew install tesseract tesseract-lang` |
| Debian/Ubuntu | `sudo apt install tesseract-ocr tesseract-ocr-hin` (add `-tam`, `-ben`, … per language) |
| Windows | the installer from the [UB Mannheim build](https://github.com/UB-Mannheim/tesseract/wiki), with the language packs ticked |

Only the language packs for the languages you enable are needed. See
[Languages](languages.md).

## With Docker

```bash
docker build -t dueproof --build-arg OCR_PACKS="tesseract-ocr-hin tesseract-ocr-tam" .
```

```bash
docker run -d -p 8000:8000 -v dueproof-data:/data --name dueproof dueproof
```

```bash
docker exec -it dueproof dueproof users add you@example.org --admin
```

`compose.yaml` runs Dueproof behind Caddy with automatic HTTPS; see
[Deployment](deployment.md). The image has not yet been published or tested in
CI — build it yourself for now.

## Translation weights (optional)

Reading Indian languages works best with the local translation model,
IndicTrans2 (AI4Bharat, MIT). The weights are licence-gated, so they are
fetched once, by hand:

1. Accept the licence at
   <https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M>.
2. `hf auth login` with a read token.
3. `dueproof fetch-model`

The weights (about 1 GB) land in `<data>/models/indictrans2`. Every file is
checked against a pinned SHA-256 each time it is loaded; the app itself never
downloads anything. For an air-gapped server, run step 3 on a connected
machine and copy the folder across.

Without the weights Dueproof still works: other-language text is read, searched
and shown, and the profile's own-language vocabulary (if any) finds
obligations. See [Languages](languages.md).

## Check

```bash
dueproof doctor
```

It checks Python, Tesseract and each language pack, the translation weights,
the data folder, the database and sign-in, and says what to fix.
