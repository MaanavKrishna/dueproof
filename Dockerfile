# Dueproof in a container.
#   docker build -t dueproof .
#   docker run -p 8000:8000 -v dueproof-data:/app/data dueproof
#
# OCR_PACKS lists the Tesseract language packs to install beside English, for
# the languages you will enable with DUEPROOF_LANGUAGES, e.g.
#   --build-arg OCR_PACKS="tesseract-ocr-hin tesseract-ocr-tam"
FROM python:3.14-slim

ARG OCR_PACKS=""
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr ${OCR_PACKS} \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Translation weights are never downloaded by the image or the app. To enable
# translation, run scripts/fetch_model.py on a connected machine and mount the
# result:  -v /path/to/models:/app/models:ro
RUN useradd --create-home dueproof && mkdir -p /app/data && chown -R dueproof /app/data
USER dueproof
VOLUME /app/data
ENV DUEPROOF_HOST=0.0.0.0 DUEPROOF_PORT=8000 DUEPROOF_PROFILE=general
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["sh", "-c", "exec python -u -m uvicorn app:app --host $DUEPROOF_HOST --port $DUEPROOF_PORT --log-level warning"]
