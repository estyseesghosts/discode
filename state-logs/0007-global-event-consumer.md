# 0007 — Global OpenCode event consumer

- **Slice:** Add one global OpenCode event consumer over the shared client.
- **Acceptance criteria:**
  - Subscribe to the shared OpenCode event stream exactly once through a narrow injectable client boundary.
  - Consume the native async event iterable and pass each event to one injected handler; do not create per-channel listeners or clients.
  - Preserve event location/session context so later routing can inspect it, while avoiding assumptions that every event has a location.
  - Define explicit behavior for stream completion, stream failure, and handler failure without leaking sensitive event payloads.
  - Add focused tests for one subscription, multiple events, location/context preservation, completion, stream failure, and handler failure.
  - Do not add run indexing/reducers, Discord status updates, persistence, automatic discovery, or bot startup wiring.
- **Context:** Starting from `11bcc5c` plus handoff commit `4f7501d`, normal Discord messages are forwarded through the shared client. The next first-milestone step is one global OpenCode event consumer that logs/reduces events without per-channel listeners.
- **Changes:** Added `src/opencode/events.ts` with a typed `EventCapableClient`, preserved structural event/location/session context, one-subscription `consumeOpenCodeEvents`, safe `OpenCodeError` wrapping, completion summaries, and isolated handler failures. Added `eventSessionId` and `eventDirectory` helpers for later routing. Added focused tests for subscription count, abort forwarding, event order/context, location-less events, completion, stream/subscribe failures, handler isolation, and malformed context.
- **Verification:** `npm test` passed: 8 files, 97 tests. `npm run typecheck` passed. `git diff --check` passed. No lint or build scripts are defined yet.
- **Decisions:** Keep the consumer global and handler-injected rather than creating per-channel listeners. Pass events through untouched so later routing/reduction owns semantics. Continue consuming after per-event handler failures and report them as counts. Treat subscribe/stream failures as terminal for this boundary; reconnect/backoff belongs to future bot wiring. Do not log raw event payloads; preserve context only for safe downstream routing.
- **Risks / follow-ups:** Sequential handler processing can fill the native bounded subscriber queue during slow high-volume bursts; future wiring/reducer design must address buffering or backpressure. Preserved error `cause` values must never be logged verbatim because native transport errors can contain payload fragments. No live SSE test or startup wiring exists yet. The next concrete slice is session/run indexing plus a minimal semantic event reducer that maps event session/location context to runtime run records; do not add persistence or automatic discovery yet.
- **Commit:** `slice: add global OpenCode event consumer` (metadata updated after commit).
