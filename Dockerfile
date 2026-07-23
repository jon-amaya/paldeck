# Multi-stage: build the frontend, embed it into the Go binary (go:embed
# all:frontend/dist in main.go — the dist folder must exist before `go build`),
# then ship just the static binary. No CGO (modernc.org/sqlite is pure Go),
# so the runtime stage stays minimal.

FROM node:22-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=frontend /src/frontend/dist ./frontend/dist
RUN CGO_ENABLED=0 go build -o /out/paldeck .

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/paldeck /usr/local/bin/paldeck
ENV PALDECK_ADDR=:8080 \
    PALDECK_DB=/data/paldeck.db
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/paldeck"]
