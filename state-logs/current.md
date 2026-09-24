# Current State

## Current baseline

The repository now contains the TypeScript foundation, channel/thread project binding, global `/project attach`, shared OpenCode client boundary, and global `/run new` interaction path.

## Completed slices

- `0001-repository-foundation.md` — Git, documentation, OpenCode configuration, and helper-agent structure.
- `0002-agent-permissions.md` — Explicitly granted implementation capabilities and enforced read-only helpers.
- `0003-typescript-foundation.md` — Node/TypeScript setup, configuration validation, binding-store types, transitions, and focused tests (`15ce311`; handoff recorded in `fbeedc7`).
- `0004-discord-project-attach.md` — Global `/project attach` command definition/registration and channel/thread-scoped interaction handling with absolute-path validation (`715a5bb`).
- `0005-opencode-run-new.md` — Shared OpenCode V2 client/session boundary and global `/run new` interaction path with selected-run attachment.

## Active slice

None. Slice 0005 is complete.

## Next slice

Implement normal Discord message forwarding through the shared OpenCode client: ignore bot messages, unbound channels, and channels without a selected run, then prompt the selected root session with the message text. Add focused tests for message scoping and failure handling. Do not add global event consumption, run indexing/reducers, persistence, or automatic discovery yet.
