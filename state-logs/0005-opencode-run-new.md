# 0005 — Shared OpenCode client and `/run new`

- **Slice:** Add one shared OpenCode client boundary and the first `/run new` interaction path.
- **Acceptance criteria:**
  - Provide a single OpenCode client factory/configuration boundary that can serve multiple project directories without per-channel clients.
  - Add the global `/run new` command with no hard-coded IDs.
  - Handle `/run new` by resolving the invoking channel/thread binding, creating a root OpenCode session in that binding's project directory, attaching the returned run/session ID through the existing `BindingStore`, and replying clearly.
  - Reply ephemerally and safely for unbound channels, missing channel context, OpenCode failures, and binding-update failures.
  - Add focused tests for client construction, command shape/registration, successful run creation, independent channel scoping, replacement of prior run selection, and failure paths.
  - Do not add normal-message forwarding, global event consumption, run indexing/reducers, persistence, or automatic discovery.
- **Context:** Starting from `715a5bb` plus handoff commit `b996984`, `/project attach` is complete. The next milestone step is `/run new`, using one shared OpenCode backend and the existing channel-to-project binding store.
- **Changes:** Added `@opencode/client` as a runtime dependency. Added `src/opencode/client.ts` with a side-effect-free injectable client factory, explicit `session.create` location delegation, response validation, and typed OpenCode errors. Added the global `/run new` command and registration payload. Added `src/discord/run-new.ts` with channel-scoped handling, unbound/missing-context replies, safe OpenCode/store failure handling, selected-run replacement, and compile-time discord.js interaction compatibility. Added focused OpenCode client, command, and `/run new` tests.
- **Verification:** `npm test` passed: 6 files, 69 tests. `npm run typecheck` passed. `git diff --check` passed. No lint or build scripts are defined yet.
- **Decisions:** Keep client construction side-effect-free and inject one shared client into the interaction boundary; do not create a module-level client from environment or a client per channel. Use the OpenCode V2 `session.create({ location: { directory } })` operation. Store the returned root session ID as the current opaque `activeRunId`; a future run registry must clarify run ID versus root session ID ownership. Keep the existing `BindingStore` as the only channel binding owner.
- **Risks / follow-ups:** A successful OpenCode session can be orphaned if the subsequent binding update fails; this race is currently limited but should be addressed when runtime lifecycle and run indexing are introduced. Errors are safely hidden from Discord but not yet logged server-side. No live OpenCode or Discord smoke test has been run. The next concrete slice is normal Discord message forwarding through the shared client: ignore bot messages, unbound channels, and channels without a selected run, then prompt the selected root session with focused tests. Do not add event consumption yet.
- **Commit:** `slice: add shared OpenCode client and run new` (metadata updated after commit).
