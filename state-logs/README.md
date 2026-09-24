# State Logs

This directory is the durable handoff record for long-horizon work on the Discord-to-OpenCode bot.

## Format

Create one file per completed or intentionally stopped slice. Use `NNNN-short-slug.md` with the next four-digit sequence number. Each entry should include:

- **Slice** — the goal and acceptance criteria
- **Context** — the starting commit and relevant design constraints
- **Changes** — files and behavior added or changed
- **Verification** — commands/checks run and their results
- **Decisions** — important choices and rejected alternatives
- **Risks / follow-ups** — unresolved issues and the next concrete slice
- **Commit** — the commit that records the finished slice

Update [`current.md`](current.md) at the end of every slice. Keep entries factual and concise; do not store credentials or private runtime data.
