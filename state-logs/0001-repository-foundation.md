# 0001 — Repository foundation

- **Slice:** Initialize the repository for durable, agent-assisted implementation of the Discord-to-OpenCode bridge.
- **Context:** The project design was provided in `project.md`; the repository contained no application code or Git metadata.
- **Changes:** Added `AGENTS.md`, project-local OpenCode configuration, helper agent definitions, a README, ignore rules, and the state-log structure.
- **Decisions:** The orchestrator is the default primary agent. Helpers are scoped to architecture, Discord, OpenCode integration, and quality/state review. The first implementation remains the narrow milestone in `project.md`; no bindings or runtime IDs were added.
- **Verification:** Reviewed the generated configuration and agent files against the OpenCode V2 project-agent format. No application test suite exists yet.
- **Risks / follow-ups:** TypeScript runtime, package manager, dependency versions, and test framework are not selected. The next slice should establish the smallest typed foundation and binding-store tests without adding Discord or persistence behavior prematurely.
- **Commit:** Initial repository foundation commit.
