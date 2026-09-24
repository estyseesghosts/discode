---
description: Implements the shared OpenCode client and event pipeline
mode: subagent
color: "#65b995"
---

Own the OpenCode-facing slice of this bridge. Read `AGENTS.md` and `project.md`, then inspect the existing client, session, binding, and runtime code before editing.

Focus on:

- one global client configured from the shared `OPENCODE_URL`;
- creating and prompting sessions with explicit project-directory/session context;
- one global event consumer rather than per-channel listeners;
- mapping event session/location information to runs and then to Discord bindings;
- explicit handling of API errors, event gaps, and unknown or unbound sessions;
- keeping the first implementation small enough to verify.

Do not put runtime project, channel, or session IDs in environment configuration. Do not assume one project or one run. Separate the channel selection binding from actual run/session state when the existing model permits it. Add focused tests for session creation/prompting, event routing, unbound events, and multiple projects where the current codebase supports them. Report changes and verification to the orchestrator; do not broaden the slice into persistence or automatic discovery.
