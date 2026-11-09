FROM python:3.13-slim AS builder

WORKDIR /app

COPY common/requirements.txt .
COPY relay/requirements.txt ./relay-requirements.txt

RUN \
  pip install --user --no-cache-dir -r requirements.txt && \
  pip install --user --no-cache-dir -r relay-requirements.txt



FROM python:3.13-slim

WORKDIR /app

COPY --from=builder /root/.local /root/.local

COPY common /app/common
COPY relay/src /app/relay/src
COPY relay/*.py relay/VERSION /app/relay/

ENV PATH=/root/.local/bin:$PATH

CMD ["python", "-m", "relay.app"]
