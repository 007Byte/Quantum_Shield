# Stage 1: Builder
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git gcc musl-dev

# Copy all source (needed for go mod tidy to resolve imports)
COPY . .

# Resolve dependencies (regenerates go.sum from source imports)
RUN go mod tidy && go mod download

# Build API server
RUN CGO_ENABLED=1 \
    go build \
    -ldflags="-w -s" \
    -o /app/bin/api \
    ./cmd/api

# Build migration CLI
RUN CGO_ENABLED=1 \
    go build \
    -ldflags="-w -s" \
    -o /app/bin/migrate \
    ./cmd/migrate

# Stage 2: Runtime
FROM alpine:3.19

LABEL org.opencontainers.image.source="https://github.com/user/usbvault-enterprise"
LABEL org.opencontainers.image.description="USBVault Enterprise Zero-Knowledge API Server"
LABEL org.opencontainers.image.licenses="Proprietary"

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates curl

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy binaries from builder
COPY --from=builder /app/bin/api /app/api
COPY --from=builder /app/bin/migrate /app/migrate

# Copy migration SQL files
COPY --from=builder /app/migrations /app/migrations

# Change ownership
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run application
CMD ["/app/api"]
