FROM ghcr.io/astral-sh/uv:0.11.8 AS uv

FROM node:24-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
COPY web/scripts/openapi/package.json ./scripts/openapi/package.json
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    ZELLIGE_DATA_DIR=/data \
    ZELLIGE_HOST=0.0.0.0 \
    ZELLIGE_PORT=8787 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app.py ./
COPY migrations ./migrations
COPY schemas ./schemas
COPY zellige ./zellige
COPY --from=web /web/dist ./web/dist
RUN uv sync --frozen --no-dev

RUN addgroup -S -g 10001 zellige \
    && adduser -S -D -H -u 10001 -G zellige zellige \
    && mkdir -p /data \
    && chown -R zellige:zellige /data /app

USER zellige
EXPOSE 8787

HEALTHCHECK --interval=10s --timeout=3s --start-period=3s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8787/health', timeout=2).read()"

CMD ["zellige"]
