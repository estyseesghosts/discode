# Discode

Discode is a Discord-to-OpenCode bridge. Each Discord channel or thread can attach to a project directory and select an OpenCode run independently; the OpenCode server remains one shared backend.

The design and first usable milestone are documented in [`project.md`](project.md).

## Development workflow

1. Read [`AGENTS.md`](AGENTS.md) and `project.md`.
2. Work in small, verifiable slices.
3. Update [`state-logs/current.md`](state-logs/current.md) and add a numbered state-log entry.
4. Commit every completed slice.

Project-local OpenCode agents are in [`.opencode/agents/`](.opencode/agents/).

## Running the bridge

Requires Node >=20.12. Install dependencies with `npm install` (or `npm ci`
for a clean install).

1. Create a Discord application and bot user, enable the **Message Content
   Intent**, and invite the bot with permissions to read messages and use
   slash commands in the target channels/threads.
2. Copy [`.env.example`](.env.example) to `.env` and set `DISCORD_TOKEN`,
   `DISCORD_CLIENT_ID`, and `OPENCODE_URL`. Runtime bindings (channel,
   project directory, session) are never stored here — they are attached at
   runtime via `/project attach` and `/run new`. Both `npm run start` and
   `npm run register-commands` load this file via `--env-file=.env`, so a
   missing `.env` fails at the Node level before the app's sanitized
   reporter runs.
3. Register the global commands once (or whenever their definitions change):
   `npm run register-commands`. Global commands can take a few minutes to
   propagate; the bot never registers commands on startup.
4. Ensure the shared OpenCode server is reachable at `OPENCODE_URL`, then
   start the bridge: `npm run start`.
