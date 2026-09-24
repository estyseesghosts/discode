# Current State

## Current baseline

The repository now contains the first runnable TypeScript foundation and the first Discord interaction boundary for the bridge described in `project.md`.

## Completed slices

- `0001-repository-foundation.md` — Git, documentation, OpenCode configuration, and helper-agent structure.
- `0002-agent-permissions.md` — Explicitly granted implementation capabilities and enforced read-only helpers.
- `0003-typescript-foundation.md` — Node/TypeScript setup, configuration validation, binding-store types, transitions, and focused tests (`15ce311`; handoff recorded in `fbeedc7`).
- `0004-discord-project-attach.md` — Global `/project attach` command definition/registration and channel/thread-scoped interaction handling with absolute-path validation.

## Active slice

None. Slice 0004 is complete.

## Next slice

Implement the shared OpenCode client boundary and `/run new` interaction path: create a root session for the invoking channel's bound project, attach the selected run, and reply safely for unbound channels or OpenCode failures. Do not add normal-message forwarding, global event consumption, persistence, or automatic discovery yet.
