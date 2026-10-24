# Dueproof in a container.
#
#   docker build -t dueproof .
#   docker run -p 8000:8000 -v dueproof-data:/data dueproof
#   docker exec -it <container> dueproof users add you@example.org --admin
#
# OCR_PACKS adds Tesseract language packs beside English (the default profile
# reads Hindi), e.g. --build-arg OCR_PACKS="tesseract-ocr-hin tesseract-ocr-tam".
FROM python:3.14-slim

ARG OCR_PACKS="tesseract-ocr-hin"
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr ${OCR_PACKS} \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# The CPU build of PyTorch: the GPU one is gigabytes Dueproof does not need.
RUN pip install --no-cache-dir torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
COPY pyproject.toml README.md LICENSE NOTICE ./
COPY dueproof ./dueproof
RUN pip install --no-cache-dir .

# Translation weights are never downloaded by the image or the app. Run
# `dueproof fetch-model` on a connected machine and mount the folder it fills
# at /data/models/indictrans2 (read-only is fine).
RUN useradd --create-home dueproof && mkdir -p /data && chown dueproof /data
USER dueproof
WORKDIR /data
VOLUME /data
ENV DUEPROOF_DATA=/data DUEPROOF_SECURE_COOKIES=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s \
  CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8000/health', timeout=4)"
CMD ["dueproof", "serve", "--host", "0.0.0.0", "--port", "8000"]
