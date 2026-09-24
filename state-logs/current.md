# Current State

## Current baseline

The repository now contains the complete first-milestone code path plus guarded process bootstrap and explicit command registration. It is ready for a live bot-account smoke test, pending real credentials and a reachable OpenCode service.

## Completed slices

- `0001-repository-foundation.md` — Git, documentation, OpenCode configuration, and helper-agent structure.
- `0002-agent-permissions.md` — Explicitly granted implementation capabilities and enforced read-only helpers.
- `0003-typescript-foundation.md` — Node/TypeScript setup, configuration validation, binding-store types, transitions, and focused tests (`15ce311`; handoff recorded in `fbeedc7`).
- `0004-discord-project-attach.md` — Global `/project attach` command definition/registration and channel/thread-scoped interaction handling with absolute-path validation (`715a5bb`).
- `0005-opencode-run-new.md` — Shared OpenCode V2 client/session boundary and global `/run new` interaction path with selected-run attachment (`3839fba`).
- `0006-discord-message-forwarding.md` — Shared-client `session.prompt` boundary and channel/thread-scoped normal-message forwarding (`11bcc5c`).
- `0007-global-event-consumer.md` — One shared-client OpenCode event subscription with context-preserving event handling and safe failure behavior (`448297f`).
- `0008-run-indexing-event-reducer.md` — Explicit run/session indexing and payload-free semantic event reduction (`da97f8d`).
- `0009-runtime-wiring.md` — One-client/store/registry runtime composition, Discord routing, global event-consumer startup, and safe startup retry behavior (`c2e4b39`).
- `0010-process-bootstrap.md` — Guarded process entrypoints, explicit command registration, `.env` loading, and live-smoke documentation (`0910e2a`).

## Active slice

None. Slice 0010 is complete.

## Next slice

Run a live smoke test with user-provided Discord credentials and a reachable `OPENCODE_URL`: create `.env` from `.env.example`, enable Message Content Intent and permissions, run `npm run register-commands`, wait for global command propagation, then run `npm run start` and exercise `/project attach`, `/run new`, and a normal message. Record observed results and fix only narrowly scoped issues revealed by the smoke test.
