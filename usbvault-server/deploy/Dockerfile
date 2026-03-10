FROM golang:1.23-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git gcc musl-dev

COPY . .

RUN go mod tidy && go mod download

RUN CGO_ENABLED=1 \
    go build \
    -ldflags="-w -s" \
    -o /app/bin/api \
    ./cmd/api

# Runtime stage
FROM alpine:3.19

WORKDIR /app

RUN apk add --no-cache ca-certificates curl

RUN addgroup -g 1001 -S appgroup && \
    adduser -S -u 1001 -G appgroup appuser

COPY --from=builder /app/bin/api /app/api

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["/app/api"]
