# @cat-supplies-store/http

Shared Nest HTTP middleware for the Business API and Agent API. `requestLogger` uses Nest's built-in contextual `Logger` and the application's configured log levels and output format. Register it with `app.use(requestLogger)` before body parsers and route initialization.

Each request gets a server-generated `X-Request-Id` response header. One log entry records `requestId`, HTTP method, route pattern, status code, duration in milliseconds, and `completed` or `aborted` outcome. Successful responses use `log`, 4xx responses and disconnections use `warn`, and 5xx responses use `error`. A response interrupted before headers were sent has a null status code. Completion means the server flushed the response; it does not guarantee client receipt.

Streaming responses are logged when the response finishes or the connection closes, without reading or buffering chunks. The HTTP outcome does not describe any detached agent execution that continues after disconnection. Incoming request IDs are ignored; this diagnostic ID is independent of conversation idempotency keys.

Only the matched route pattern is logged, excluding path parameter values, queries, headers, bodies, customer identity, and error details. Requests rejected before route matching (including malformed or oversized bodies) and unknown routes use `<unmatched>`.

See Nest's [functional and global middleware](https://docs.nestjs.com/middleware) and [built-in structured logging](https://docs.nestjs.com/application/logger), and Node's [response lifecycle events](https://nodejs.org/docs/latest-v24.x/api/http.html#class-httpserverresponse).
