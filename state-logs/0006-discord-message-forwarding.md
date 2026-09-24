# 0006 — Normal Discord message forwarding

- **Slice:** Forward normal Discord messages to the selected OpenCode root session through the shared client.
- **Acceptance criteria:**
  - Extend the OpenCode client boundary with a typed prompt operation using OpenCode V2 `session.prompt({ sessionID, text })`.
  - Handle normal Discord messages using channel/thread ID first, then the bound project, then its selected run.
  - Ignore bot messages, unbound channels, channels without a selected run, blank message content, and messages without channel context.
  - Prompt the selected root session exactly once with the message text and safely handle OpenCode failures without leaking details.
  - Add focused tests for prompt construction, message scoping, bot/unbound/no-run/blank filtering, and failure behavior.
  - Do not add global event consumption, event reduction, run indexing, persistence, automatic discovery, or bot startup wiring.
- **Context:** Starting from `3839fba` plus handoff commit `73b086c`, `/project attach` and `/run new` are complete. The next first-milestone step is forwarding normal Discord messages to the selected root session.
- **Changes:** Extended `src/opencode/client.ts` with typed `session.prompt({ sessionID, text })` support and `promptSession`, preserving the one injected shared client and existing `createSession` behavior. Added `src/discord/message-forwarding.ts` with channel/thread-scoped filtering and forwarding, no reply surface, no listener registration, and no client construction. Added focused OpenCode prompt and Discord forwarding tests, including independent parent/thread routes and safe failure outcomes.
- **Verification:** `npm test` passed: 7 files, 86 tests. `npm run typecheck` passed. `git diff --check` passed. No lint or build scripts are defined yet.
- **Decisions:** Keep `session.prompt` optional on the shared test boundary so existing create-only test doubles remain valid; the forwarding boundary requires it at runtime. Trim channel IDs, run IDs, and message text before routing. Treat missing authors as human only as a defensive structural-test fallback. Return `forwarded`, `ignored`, or `failed` without replying to normal messages; future bot wiring will own logging/listener registration.
- **Risks / follow-ups:** Delivery failures currently return only a coarse `failed` outcome, so future wiring must add redacted observability. Message redelivery/idempotency and listener registration are not handled yet. `activeRunId` currently stores a root session ID until run indexing is introduced. The next concrete slice is one global OpenCode event consumer: subscribe once through the shared client, inspect event location/session context, and log or reduce events without creating per-channel listeners. Do not add persistence or automatic discovery yet.
- **Commit:** `slice: add normal message forwarding` (metadata updated after commit).
