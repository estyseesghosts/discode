# Current State

## Current baseline

The repository now contains the TypeScript foundation, channel/thread project binding, global `/project attach`, shared OpenCode client boundary, global `/run new`, and normal-message forwarding to selected root sessions.

## Completed slices

- `0001-repository-foundation.md` — Git, documentation, OpenCode configuration, and helper-agent structure.
- `0002-agent-permissions.md` — Explicitly granted implementation capabilities and enforced read-only helpers.
- `0003-typescript-foundation.md` — Node/TypeScript setup, configuration validation, binding-store types, transitions, and focused tests (`15ce311`; handoff recorded in `fbeedc7`).
- `0004-discord-project-attach.md` — Global `/project attach` command definition/registration and channel/thread-scoped interaction handling with absolute-path validation (`715a5bb`).
- `0005-opencode-run-new.md` — Shared OpenCode V2 client/session boundary and global `/run new` interaction path with selected-run attachment (`3839fba`).
- `0006-discord-message-forwarding.md` — Shared-client `session.prompt` boundary and channel/thread-scoped normal-message forwarding (`11bcc5c`).

## Active slice

None. Slice 0006 is complete.

## Next slice

Implement one global OpenCode event consumer through the shared client. Subscribe once, consume the event async iterable, inspect event location/session context, and expose a safe event-processing boundary that logs or reduces events without creating per-channel listeners. Do not add persistence, run indexing/reducers, automatic discovery, or bot startup wiring yet.
