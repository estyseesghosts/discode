# Current State

## Current baseline

The repository now contains the TypeScript foundation, channel/thread project binding, global `/project attach`, shared OpenCode client boundary, global `/run new`, normal-message forwarding, one global OpenCode event consumer, run indexing/semantic reduction, and a tested runtime composition/startup boundary.

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

## Active slice

None. Slice 0009 is complete.

## Next slice

Add the process bootstrap and explicit command-registration entrypoint needed for a live bot-account smoke test: load validated environment configuration, create the real Discord gateway, register commands through an explicit deployment path, start the runtime, and expose a safe top-level failure/log boundary. Keep status messages, persistence, discovery, and reconnect/backoff out of scope.
