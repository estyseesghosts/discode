# Discode

Discode is a Discord-to-OpenCode bridge. Each Discord channel or thread can attach to a project directory and select an OpenCode run independently; the OpenCode server remains one shared backend.

The design and first usable milestone are documented in [`project.md`](project.md).

## Development workflow

1. Read [`AGENTS.md`](AGENTS.md) and `project.md`.
2. Work in small, verifiable slices.
3. Update [`state-logs/current.md`](state-logs/current.md) and add a numbered state-log entry.
4. Commit every completed slice.

Project-local OpenCode agents are in [`.opencode/agents/`](.opencode/agents/).
