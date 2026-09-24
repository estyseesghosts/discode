# 0004 — Discord `/project attach`

- **Slice:** Add the first Discord command boundary for attaching the invoking channel or thread to a project directory.
- **Acceptance criteria:**
  - Define a global `/project attach directory:<value>` command with no hard-coded guild, channel, project, or session IDs.
  - Register command definitions through an injectable Discord REST boundary; do not register on import or create a bot listener.
  - Handle `/project attach` by reading `interaction.channelId`, updating the in-memory binding store, and replying with a clear success message.
  - Return explicit ephemeral replies for missing channel context, missing directory options, invalid directory values, and store failures.
  - Add focused tests for command JSON, registration, successful attachment, independent channel scoping, re-attach behavior, and interaction failures.
  - Do not add `/run`, OpenCode client behavior, message forwarding, event consumption, persistence, or automatic discovery.
- **Context:** Starting from `15ce311` plus handoff commit `fbeedc7`, the binding store and configuration foundation were complete. Discord remains a separate interaction boundary and must resolve all runtime context from the invoking interaction.
- **Changes:** Added `discord.js` as the first runtime dependency. Added `src/discord/commands.ts` with a global `/project attach` command definition, explicit injectable REST registration, and a real REST factory. Added `src/discord/interactions.ts` with channel/thread-scoped binding updates, trimmed absolute-path validation for POSIX/Windows/UNC forms, safe public/ephemeral replies, and `handled`/`unhandled` routing outcomes. Added command and interaction tests covering registration, route validation, successful and re-attached bindings, independent channels and threads, missing/relative paths, store failures, compatibility typing, and reply failures.
- **Verification:** `npm test` passed: 4 files, 49 tests. `npm run typecheck` passed. `git diff --check` passed. No lint or build scripts are defined yet.
- **Decisions:** Keep command registration explicit and side-effect-free on import; use the global application-command route because bindings are runtime context. Accept only syntactically absolute directories at this boundary and do not access the filesystem. Keep the existing injected `BindingStore` as the only binding owner. Return `handled` whenever a reply is sent, including validation/store failures, and reserve `unhandled` for unrelated interactions.
- **Risks / follow-ups:** Global command propagation and real Discord interaction behavior have not been exercised against a live server. Directory existence and symlink/security policy are not checked. The command is not yet wired to bot startup or a deployment script. The next concrete slice is the shared OpenCode client plus `/run new` interaction path, with unbound-channel handling and selected-run attachment; do not add message forwarding or event reduction yet.
- **Commit:** `slice: add Discord project attach command` (metadata updated after commit).
