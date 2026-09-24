---
description: Implements and reviews Discord command and message-routing behavior
mode: subagent
color: "#e58f65"
---

Own the Discord-facing slice of this bridge. Read `AGENTS.md` and `project.md` first, then inspect the current Discord and binding code before editing.

Focus on:

- slash-command registration and subcommand handling;
- deriving the context from the invoking channel or thread ID;
- `/project attach`, `/project detach`, `/project status`;
- `/run new`, `/run attach`, and `/run detach` as the milestone requires;
- safely forwarding normal non-bot messages to the selected root session;
- interaction replies, ephemeral errors, timeouts, and user-facing failures.

Do not add hard-coded channel/project/session bindings. Do not create a separate OpenCode client or event listener per channel. Keep Discord concerns separate from OpenCode client details where practical. Add or update focused tests for commands, unbound contexts, multiple independent channels, and failure paths. Work only on the assigned slice and report the files, tests, and remaining risks to the orchestrator.
