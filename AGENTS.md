# Agent Operating Guide

## Mission

Build a Discord bot that lets each Discord channel or thread bind to a project directory and independently select an OpenCode root run. The authoritative design and first milestone are in [`project.md`](project.md). Preserve the central model:

```text
Discord channel/thread -> project directory -> selected OpenCode run
```

There must be no hard-coded project, channel, or session bindings in configuration. Runtime bindings belong in application state, not environment variables or project configuration.

## Long-horizon workflow

This repository is intended to be worked on across many sessions and by multiple agents. Treat every coherent, testable increment as a **slice**.

For every slice:

1. Read this file, `project.md`, and the most recent entries in `state-logs/` before changing code.
2. Define the slice's scope and acceptance criteria in the active state log.
3. Prefer the smallest vertical slice that can be verified. Do not expand into persistence, discovery, or run indexing until the first milestone works.
4. Have the orchestrator delegate focused investigation or implementation to the appropriate helper agents.
5. Run the narrowest relevant checks first, then the full test/typecheck/lint suite when available.
6. Record the outcome, decisions, verification, remaining risks, and next slice in `state-logs/`. Never leave the log as a vague progress note.
7. Commit the complete slice, including code, tests, documentation, and its state-log entry. A slice is not complete until its commit exists.

Use descriptive commits, for example `slice: add channel binding store`. Do not combine unrelated slices in one commit. If a slice cannot be completed, record the exact stopping point and leave the repository in a coherent state before stopping.

## State logs

- `state-logs/` is the durable handoff record for long-running work. Keep entries append-only; correct an earlier entry with a new dated note rather than rewriting history.
- `state-logs/current.md` is the concise handoff for the next agent. Update it at the end of every slice.
- Keep secrets, tokens, full environment files, and sensitive logs out of all logs and commits.
- Refer to commits and file paths in state logs so the next session can reconstruct the exact baseline.

## Engineering rules

- Configuration contains only bot/server settings such as Discord credentials and the shared OpenCode URL.
- Resolve all runtime context from the Discord channel/thread ID first, then its project directory, then its selected run/session.
- Keep one shared OpenCode client and one event-ingestion pipeline; do not create per-channel listeners or clients.
- Separate channel-to-project/run selection from actual run/session state as described in `project.md`.
- Use explicit error handling at Discord interaction boundaries, OpenCode API boundaries, and event reduction boundaries.
- Add tests for binding transitions, unbound contexts, multiple independent bindings, and event routing as those behaviors are introduced.
- Keep the first milestone in scope: `/project attach`, `/run new`, normal-message forwarding, and a global event consumer. Do not add hard-coded IDs, automatic discovery, or persistence prematurely.

## Agent roles

The project-local agents live in `.opencode/agents/`:

- `orchestrator` owns planning, delegation, integration, verification, state logs, and slice commits.
- `architecture` analyzes the design and produces implementation boundaries without editing.
- `discord` implements and reviews Discord command and message-routing behavior.
- `opencode-integration` implements and reviews the shared OpenCode client and event pipeline.
- `state-and-quality` checks tests, invariants, state-log completeness, and final diff quality.

Helpers should report findings with file/line references and leave implementation decisions to the orchestrator unless their assignment explicitly includes edits.
