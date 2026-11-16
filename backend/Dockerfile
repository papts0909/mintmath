FROM python:3.12-slim

ARG TECTONIC_VERSION=0.15.0
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    XDG_CACHE_HOME=/opt/cache

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        poppler-utils fontconfig fonts-dejavu-core curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/tectonic.tgz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/tectonic.tgz -C /usr/local/bin tectonic \
    && rm /tmp/tectonic.tgz \
    && tectonic --version

WORKDIR /app
COPY pyproject.toml ./
RUN pip install --no-cache-dir "fastapi>=0.115" "pydantic>=2.7" "uvicorn[standard]>=0.30"

COPY app ./app
COPY warmup ./warmup

# Compile a sample once so every TeX package/font lands in the cache at build time;
# at runtime no network access is needed for the usual packages.
RUN python -m warmup.warmup && chmod -R a+rX /opt/cache

RUN useradd --create-home --uid 10001 mathpad
USER mathpad
ENV XDG_CACHE_HOME=/opt/cache

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
