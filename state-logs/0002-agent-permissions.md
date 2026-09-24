# 0002 — Harden agent permissions

- **Slice:** Make project agent capabilities explicit and enforce role boundaries.
- **Context:** The orchestrator and implementation helpers were not explicitly granted edit/shell access, while read-only helpers denied only two actions and could become more permissive if new tools were added.
- **Changes:** Granted the orchestrator read, discovery, edit, shell, and subagent access; granted `discord` and `opencode-integration` read, discovery, edit, and shell access while preventing nested delegation; made `architecture` and `state-and-quality` deny all actions except read, glob, and grep.
- **Verification:** `git diff --check` passed. Agent frontmatter and instructions were reviewed after editing; no application tests exist yet.
- **Risks / follow-ups:** Permission behavior should be rechecked when OpenCode adds new tools or permission actions. The read-only quality reviewer intentionally does not execute test commands; the orchestrator or an implementation agent must run them.
- **Commit:** `73476c1` (`chore: harden agent permissions`).
- **2026-09-24 clarification:** The agent-permission changes are present in commit `73476c1`; unrelated model-line edits in `.opencode/agents/` are intentionally not part of slice 0003.
