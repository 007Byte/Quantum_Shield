# ADR-001: Go Backend for REST API Server

## Status: Accepted

## Date: 2024-01-15

## Context

The Quantum_Shield project requires a performant REST API server capable of handling encrypted data operations with minimal latency. The backend must support:

- Real-time session management with Redis integration
- FFI calls to Rust cryptographic cores
- PostgreSQL ORM with complex query patterns
- Rate limiting and distributed caching
- Horizontal scaling across multiple instances

Initial prototypes were evaluated in Node.js (Express), Rust (Actix), and Python (FastAPI).

## Decision

Use **Go 1.22+** with the **Chi router** for the REST API server.

Key implementation details:
- Chi for HTTP routing: lightweight, fast, with excellent middleware ecosystem
- Standard library `net/http` with Chi as the wrapper for type safety
- `database/sql` with `sqlc` for PostgreSQL integration
- Custom FFI bridge package (`pkg/crypto`) for Rust interop
- Structured logging with `zerolog`
- Error handling via custom `apierrors` package with standard HTTP codes

## Alternatives Considered

1. **Node.js (Express/Fastify)**
   - Pros: Rapid development, large npm ecosystem, easy for team onboarding
   - Cons: Runtime overhead for FFI calls, garbage collection pauses impact latency-sensitive operations, harder to profile in production

2. **Rust (Actix-web)**
   - Pros: Maximum performance, memory safety, zero-cost abstractions
   - Cons: Steeper learning curve, slower development velocity, complex async model causes maintenance burden

3. **Python (FastAPI)**
   - Pros: Developer-friendly, excellent for rapid prototyping
   - Cons: GIL limits concurrency, FFI calls block the interpreter, unsuitable for production scale

## Consequences

### Positive Outcomes

- Single-threaded event loop replaced with true concurrency via goroutines
- FFI overhead negligible compared to Node.js or Python
- Excellent profiling tools (pprof) enable production optimization
- Fast build times (< 5 seconds) accelerate development iteration
- Simple deployment model: single binary with no runtime dependencies
- Excellent standard library reduces external dependencies

### Negative Outcomes

- Smaller ecosystem compared to Node.js (though this limits supply-chain risk)
- Learning curve for developers from dynamic language backgrounds
- CQRS patterns are less idiomatic in Go (mitigated via code generation)

## Implementation Notes

- Chi routes mounted under `/api/v1/` prefix
- Middleware stack: auth → rate-limit → request-id → logging → recovery
- All FFI calls wrapped in `crypto.Encrypt()` and `crypto.Decrypt()` functions
- Error propagation via custom error types in `apierrors` package
- All handlers return structured JSON with X-Request-ID header for tracing
