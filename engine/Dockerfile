# syntax=docker/dockerfile:1.7
# Multistage build for the RF Rust API.
#
# Build stage compiles the cargo workspace with release optimisations,
# backed by two BuildKit cache mounts: one for the cargo registry
# (so crate downloads persist across builds) and one for the target
# directory (so incremental compile artifacts persist). Together
# those two mounts are what keeps redeploys fast — we don't try to
# do the "copy manifests first, stub sources" trick because cargo
# workspaces with benches/examples make it brittle.
#
# Final stage is a distroless cc image — small attack surface, no
# shell, no package manager — that carries only the stripped
# `rf-api` binary plus the CA bundle distroless already ships
# with (needed for `reqwest` + `rustls-tls` to verify the Supabase
# TLS chain).
#
# Build from the `engine/` workspace root:
#   docker build -f engine/Dockerfile -t rf-api engine/
# or via the Fly config:
#   fly deploy --config engine/fly.toml

ARG RUST_VERSION=1.93

FROM rust:${RUST_VERSION}-bookworm AS build

WORKDIR /src

COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/

# Release build backed by BuildKit cache mounts. The cache mounts
# are host-side, so we copy the final binary OUT of target/ before
# the mount unmounts — otherwise the image wouldn't carry it.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    set -eux; \
    cargo build --release -p rf-api --bin rf-api; \
    cp /src/target/release/rf-api /tmp/rf-api; \
    strip /tmp/rf-api

FROM gcr.io/distroless/cc-debian12:nonroot AS runtime

ENV RF_API_BIND=0.0.0.0:8080 \
    RUST_LOG=info

WORKDIR /app

COPY --from=build /tmp/rf-api /app/rf-api

EXPOSE 8080

# Nonroot image runs as UID 65532. Fly.io respects the Dockerfile
# USER directive — no need for a `[processes]` tweak.
ENTRYPOINT ["/app/rf-api"]
