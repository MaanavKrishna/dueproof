# The full engine (engine-fast + engine-heavy in one image), for the
# self-hosted server, the desktop sidecar and the Vercel Sandbox snapshot.
#
#   docker build -t dueproof-engine services/engine
#   docker run --read-only --tmpfs /tmp -p 8000:8000 \
#     -e ENGINE_SHARED_SECRET=... \
#     -v /srv/dueproof/indictrans2:/models/indictrans2:ro \
#     dueproof-engine
#
# Stateless and read-only friendly: the engine writes nothing but /tmp.
# PaddleOCR models are fetched at build time (pinned SHA-256). Translation
# weights are licence-gated and never downloaded by the image: run
# `python -m dueproof_engine.tools.model` once on a connected machine and
# mount the folder it fills at /models/indictrans2 (read-only is fine).
# Without them /v1/translate answers engine "none".
#
# OCR_PACKS adds Tesseract language packs beside English, e.g.
#   --build-arg OCR_PACKS="tesseract-ocr-hin tesseract-ocr-tam tesseract-ocr-mal"
# INSTALL_TRANSLATION=0 leaves torch and IndicTrans2 out (a much smaller image).
# INSTALL_TESSERACT=0 also leaves out rung 3 (the binary, its packs and OpenCV):
# text layer + PaddleOCR only, the engine-fast shape, for small servers.

FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928 AS build
ARG INSTALL_TRANSLATION=1
ARG INSTALL_TESSERACT=1
# Keep equal to pyproject.toml and uv.lock (see the comment below).
ARG TORCH_VERSION=2.15.0
COPY --from=ghcr.io/astral-sh/uv:0.11@sha256:77280f2f771df71f90786c314fe1bbc1e023feac652969bbf139c280babf2eb7 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/engine
WORKDIR /src
COPY pyproject.toml uv.lock ./
# torch from PyTorch's CPU index first, pinned to the locked version, so the
# heavy group does not pull the CUDA build (gigabytes the engine never uses).
# Unpinned, a new torch release would be installed here and then swapped by
# `uv sync` for the locked version from PyPI, which is the CUDA build.
RUN uv venv /opt/engine \
 && if [ "$INSTALL_TRANSLATION" = "1" ]; then \
      uv pip install --python /opt/engine/bin/python "torch==${TORCH_VERSION}" --index-url https://download.pytorch.org/whl/cpu \
      && uv sync --frozen --no-install-project --no-default-groups --group heavy --inexact; \
    elif [ "$INSTALL_TESSERACT" = "1" ]; then \
      uv sync --frozen --no-install-project --no-default-groups --group tesseract; \
    else \
      uv sync --frozen --no-install-project --no-default-groups; \
    fi
COPY dueproof_engine ./dueproof_engine
COPY scripts/fetch_ocr_models.py ./scripts/
RUN /opt/engine/bin/python scripts/fetch_ocr_models.py --dest /opt/models/ppocr

FROM python:3.15-slim@sha256:65a65fc7b30b06cb6df4930fd4650697cb23f4c2698ab81fc87e4b031bc36928
ARG INSTALL_TESSERACT=1
ARG OCR_PACKS="tesseract-ocr-hin tesseract-ocr-mal tesseract-ocr-tam"
RUN if [ "$INSTALL_TESSERACT" = "1" ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends tesseract-ocr ${OCR_PACKS} \
      && rm -rf /var/lib/apt/lists/*; \
    fi \
 && useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin engine
COPY --from=build /opt/engine /opt/engine
COPY --from=build /opt/models /models
COPY --chown=root:root dueproof_engine /app/dueproof_engine
WORKDIR /app
ENV PATH=/opt/engine/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    DUEPROOF_MODELS=/models DUEPROOF_LANGUAGES=all \
    HF_HOME=/tmp/hf
USER engine
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/health', timeout=4)"
# Idle keep-alive connections close after 5 s and one header block is capped at 16 kB; the
# body's size and total time are capped in the app (Guard). uvicorn has no header-read timeout.
CMD ["uvicorn", "dueproof_engine.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--no-server-header", "--timeout-keep-alive", "5", "--h11-max-incomplete-event-size", "16384"]
