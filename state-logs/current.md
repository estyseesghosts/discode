# Current State

## Current baseline

The repository now contains the TypeScript foundation, channel/thread project binding, global `/project attach`, shared OpenCode client boundary, global `/run new`, normal-message forwarding, and one global OpenCode event consumer.

## Completed slices

- `0001-repository-foundation.md` — Git, documentation, OpenCode configuration, and helper-agent structure.
- `0002-agent-permissions.md` — Explicitly granted implementation capabilities and enforced read-only helpers.
- `0003-typescript-foundation.md` — Node/TypeScript setup, configuration validation, binding-store types, transitions, and focused tests (`15ce311`; handoff recorded in `fbeedc7`).
- `0004-discord-project-attach.md` — Global `/project attach` command definition/registration and channel/thread-scoped interaction handling with absolute-path validation (`715a5bb`).
- `0005-opencode-run-new.md` — Shared OpenCode V2 client/session boundary and global `/run new` interaction path with selected-run attachment (`3839fba`).
- `0006-discord-message-forwarding.md` — Shared-client `session.prompt` boundary and channel/thread-scoped normal-message forwarding (`11bcc5c`).
- `0007-global-event-consumer.md` — One shared-client OpenCode event subscription with context-preserving event handling and safe failure behavior.

## Active slice

None. Slice 0007 is complete.

## Next slice

Implement session/run indexing plus a minimal semantic event reducer: represent root OpenCode sessions as runtime runs, map event session/location context into those runs, and expose deterministic reducer state without Discord status updates. Keep persistence, automatic discovery, and live startup wiring out of scope.
