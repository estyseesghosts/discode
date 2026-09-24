# 0003 — TypeScript foundation and binding store

- **Slice:** Establish the smallest runnable TypeScript foundation: configuration validation and an in-memory Discord channel/thread-to-project/run-selection store.
- **Acceptance criteria:**
  - A Node/TypeScript project has reproducible scripts for typechecking and focused tests, with a committed lockfile.
  - Configuration validation accepts only the three bot/server settings (`DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `OPENCODE_URL`), rejects missing/blank values and invalid non-HTTP(S) URLs, and never exposes secret values in errors.
  - The binding store keys context by Discord channel/thread ID, supports independent bindings, project attach/re-attach, selected-run replacement, run/project detach, and optional status-message IDs, and throws for run operations on unbound contexts.
  - Tests cover configuration failures, binding transitions, multiple independent contexts, shared run selection without ownership, and unbound operations.
  - No Discord, OpenCode, persistence, automatic discovery, or hard-coded runtime IDs are introduced.
- **Context:** Starting from commit `73476c1` (`chore: harden agent permissions`), the repository had documentation and agent configuration but no application runtime, package manifest, or tests. The design requires runtime bindings to be resolved by Discord channel/thread ID and kept out of configuration.
- **Changes:** Added an npm/TypeScript ESM foundation with strict NodeNext typechecking and Vitest tests; added pure `loadConfig` validation for the three allowed environment keys; added `.env.example`; added the in-memory `BindingStore` and `ProjectBinding` types with defensive copies, project/run/status transitions, and explicit unbound errors.
- **Verification:** `npm test` passed: 2 files, 15 tests. `npm run typecheck` passed. `git diff --check` passed. No lint or build scripts are defined yet.
- **Decisions:** Use npm with a committed `package-lock.json`, Node 20.12+, TypeScript strict ESM/NodeNext, and Vitest. Model selected context as an opaque `activeRunId`; actual run/session state remains outside the binding store. Re-attaching a project replaces the binding and clears run/status selection. `detachProject` is an idempotent delete, while run/status operations require an attached context. Configuration ignores unrelated environment keys, including runtime binding keys, rather than treating them as settings.
- **Risks / follow-ups:** The binding store does not yet validate a selected run against a run registry; the run-indexing slice must define run IDs versus OpenCode root session IDs. Directory normalization and OS-specific path semantics remain for the Discord command boundary. The next concrete slice is the Discord slash-command layer for `/project attach` only, including interaction lifecycle/error tests and no OpenCode or persistence behavior.
- **Commit:** `slice: add TypeScript foundation and binding store` (metadata updated after commit).
