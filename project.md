Yes. The first version should have **zero project/channel bindings in configuration**.

The stable model should be:

```text
Bot
├── Discord channel/thread A → project X → active run 12
├── Discord channel/thread B → project Y → active run 4
├── Discord thread C        → project X → active run 15
└── unbound channels        → ignored
```

This also matches the original design: the Discord concept is the **project**, while root OpenCode sessions are replaceable runs beneath it. :chatgpt-content-reference{index="0"}

## 1. Configuration

The environment should contain only bot/server configuration:

```dotenv
DISCORD_TOKEN=
DISCORD_CLIENT_ID=

OPENCODE_URL=http://127.0.0.1:4096
```

No:

```text
DISCORD_CHANNEL_ID
PROJECT_NAME
PROJECT_DIRECTORY
ROOT_SESSION_ID
```

Those are runtime state.

---

# 2. First usable interface

Before automatic discovery, manually establish bindings with Discord commands:

```text
/project attach directory:/Users/j/code/voxel-engine

/run new

/run attach session:ses_1234

/run switch session:ses_5678

/project status

/project detach
```

The command always operates on **the channel or thread where you invoke it**.

Therefore:

```text
#voxel-engine
/project attach ~/code/voxel-engine

#beeline
/project attach ~/code/beeline
```

Both work simultaneously.

A Discord thread is simply another Discord channel ID from the bot's perspective.

Later, automatic discovery replaces some manual commands. It does **not** change the underlying model.

---

# 3. Structure

I would start here:

```text
src/
├── index.ts
├── config.ts
│
├── discord/
│   ├── client.ts
│   ├── commands.ts
│   └── interactions.ts
│
├── opencode/
│   ├── client.ts
│   └── events.ts
│
├── bindings/
│   ├── types.ts
│   └── store.ts
│
└── runtime/
    ├── run-state.ts
    └── update-scheduler.ts
```

The important new component is the **binding store**.

---

# 4. Binding model

### `src/bindings/types.ts`

```ts
export interface ProjectBinding {
  discordChannelId: string;

  project: {
    directory: string;
  };

  activeRun?: {
    sessionId: string;
  };

  statusMessageId?: string;
}
```

Do not model the channel as belonging permanently to a session.

It belongs to:

```text
channel
  ↓
project
  ↓
currently selected run
```

The selected run can change repeatedly. That is important because your normal workflow creates fresh OpenCode root sessions in the same repository. :chatgpt-content-reference{index="1"}

---

# 5. In-memory binding store

Persistence can come later.

### `src/bindings/store.ts`

```ts
import type { ProjectBinding } from "./types.js";

export class BindingStore {
  private readonly bindings = new Map<string, ProjectBinding>();

  get(channelId: string): ProjectBinding | undefined {
    return this.bindings.get(channelId);
  }

  attachProject(
    channelId: string,
    directory: string,
  ): ProjectBinding {
    const binding: ProjectBinding = {
      discordChannelId: channelId,
      project: {
        directory,
      },
    };

    this.bindings.set(channelId, binding);

    return binding;
  }

  attachRun(
    channelId: string,
    sessionId: string,
  ): ProjectBinding {
    const binding = this.require(channelId);

    binding.activeRun = {
      sessionId,
    };

    return binding;
  }

  detachRun(channelId: string): void {
    const binding = this.require(channelId);
    binding.activeRun = undefined;
  }

  detachProject(channelId: string): void {
    this.bindings.delete(channelId);
  }

  setStatusMessage(
    channelId: string,
    messageId: string,
  ): void {
    const binding = this.require(channelId);
    binding.statusMessageId = messageId;
  }

  all(): Iterable<ProjectBinding> {
    return this.bindings.values();
  }

  private require(channelId: string): ProjectBinding {
    const binding = this.bindings.get(channelId);

    if (!binding) {
      throw new Error(
        `Discord channel ${channelId} is not attached to a project`,
      );
    }

    return binding;
  }
}

export const bindings = new BindingStore();
```

Eventually this interface can sit over SQLite without changing the rest of the bot.

---

# 6. OpenCode client stays global

### `src/opencode/client.ts`

```ts
import { OpenCode } from "@opencode/client";
import { config } from "../config.js";

export const opencode = OpenCode.make({
  baseUrl: config.opencodeUrl,
});
```

The OpenCode server itself is the shared backend.

Individual operations supply their directory/session context.

The V2 client supports creating sessions with a location:

```ts
await opencode.session.create({
  location: {
    directory: binding.project.directory,
  },
});
```

and prompting an existing session by ID. :chatgpt-content-reference{index="2"}

So one client can represent many projects. You do **not** need one OpenCode client per Discord channel.

---

# 7. Slash commands

For the initial implementation, I would expose only:

```text
/project attach <directory>
/project detach
/project status

/run new
/run attach <session>
/run detach
```

Later:

```text
/run list
/run switch
/agents
```

Then eventually automatic session discovery can make `/run attach` uncommon.

Discord supports global application commands, so command definitions themselves do not need a hard-coded guild. :chatgpt-content-reference{index="3"}

### `src/discord/commands.ts`

```ts
import {
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

import { config } from "../config.js";

const commands = [
  new SlashCommandBuilder()
    .setName("project")
    .setDescription("Manage the OpenCode project for this channel")
    .addSubcommand((command) =>
      command
        .setName("attach")
        .setDescription("Attach this channel to a project")
        .addStringOption((option) =>
          option
            .setName("directory")
            .setDescription("Absolute project directory")
            .setRequired(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("detach")
        .setDescription("Detach this channel from its project"),
    )
    .addSubcommand((command) =>
      command
        .setName("status")
        .setDescription("Show this channel's project binding"),
    ),

  new SlashCommandBuilder()
    .setName("run")
    .setDescription("Manage this project's active OpenCode run")
    .addSubcommand((command) =>
      command
        .setName("new")
        .setDescription("Start a fresh OpenCode root session"),
    )
    .addSubcommand((command) =>
      command
        .setName("attach")
        .setDescription("Attach an existing root session")
        .addStringOption((option) =>
          option
            .setName("session")
            .setDescription("OpenCode session ID")
            .setRequired(true),
        ),
    )
    .addSubcommand((command) =>
      command
        .setName("detach")
        .setDescription("Detach the active run"),
    ),
].map((command) => command.toJSON());

export async function registerCommands(): Promise<void> {
  const rest = new REST({ version: "10" })
    .setToken(config.discordToken);

  await rest.put(
    Routes.applicationCommands(config.discordClientId),
    {
      body: commands,
    },
  );
}
```

In production, command registration should be its own deployment script rather than happening every bot startup. Discord recommends registering commands only when their definitions change. :chatgpt-content-reference{index="4"}

---

# 8. Handle `/project`

Conceptually:

```ts
if (subcommand === "attach") {
  const directory =
    interaction.options.getString("directory", true);

  bindings.attachProject(
    interaction.channelId,
    directory,
  );

  await interaction.reply(
    `Attached this channel to \`${directory}\`.`,
  );
}
```

No global current project exists.

The context is always:

```ts
const binding = bindings.get(interaction.channelId);
```

That is a rule I would preserve throughout the bot.

---

# 9. `/run new`

This becomes more useful immediately.

```ts
const binding = bindings.get(interaction.channelId);

if (!binding) {
  await interaction.reply({
    content: "This channel is not attached to a project.",
    ephemeral: true,
  });

  return;
}

const session = await opencode.session.create({
  location: {
    directory: binding.project.directory,
  },
});

bindings.attachRun(
  interaction.channelId,
  session.id,
);

await interaction.reply(
  `Started run \`${session.id}\`.`,
);
```

Now you can do:

```text
/project attach /Users/j/code/voxel-engine
/run new
```

and get a completely fresh OpenCode session.

That corresponds directly to the cheap fresh-run behavior in the design. :chatgpt-content-reference{index="5"}

---

# 10. Normal Discord messages

Now the message handler becomes generic:

```ts
discord.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) {
    return;
  }

  const binding = bindings.get(message.channelId);

  if (!binding) {
    return;
  }

  if (!binding.activeRun) {
    return;
  }

  await opencode.session.prompt({
    sessionID: binding.activeRun.sessionId,
    text: message.content,
  });
});
```

That is much closer to the architecture we actually want.

```text
message arrives
       ↓
which Discord context?
       ↓
which project is attached?
       ↓
which run is active?
       ↓
send to root OpenCode session
```

The root session continues to own orchestration and subagents, as specified in the original design. :chatgpt-content-reference{index="6"}

---

# 11. Event routing works the opposite direction

This is where the project/run model becomes especially important.

OpenCode gives the external client a shared event stream, and events can cover multiple locations. The client documentation specifically warns consumers to inspect event location where applicable. :chatgpt-content-reference{index="7"}

So:

```text
OpenCode event
      ↓
session ID/location
      ↓
identify run
      ↓
identify Discord binding(s)
      ↓
update their semantic state
      ↓
possibly update Discord
```

Not:

```text
channel A has its own OpenCode event listener
channel B has its own OpenCode event listener
channel C has its own OpenCode event listener
```

I would use **one event ingestion pipeline**.

---

# 12. Slightly improve the model now

There is another correction worth making before writing much code.

Do not store all runtime state inside `ProjectBinding`.

Separate:

```ts
interface ProjectBinding {
  discordChannelId: string;
  directory: string;
  activeRunId?: string;
  statusMessageId?: string;
}

interface Run {
  id: string;
  projectDirectory: string;
  rootSessionId: string;
  state: RunState;
}
```

Then:

```text
bindings
channel → project/run selection

runs
root OpenCode session → actual runtime state
```

This matters because your own design explicitly allows **multiple active root sessions in one project**. :chatgpt-content-reference{index="8"}

So eventually:

```text
Voxel Engine
├── Run 42
│   ├── root ses_A
│   └── children...
│
└── Run 43
    ├── root ses_B
    └── children...
```

and a Discord channel merely says:

```text
activeRunId = 43
```

It does not own Run 43.

---

## The first milestone

I would now implement only this:

```text
Discord bot starts
        ↓
/project attach <directory>
        ↓
/run new
        ↓
OpenCode creates root session
        ↓
Discord channel becomes attached to that run
        ↓
normal Discord messages → root session
        ↓
one global OpenCode event consumer logs events
```

No hard-coded channels.  
No hard-coded projects.  
No hard-coded sessions.  
No assumption that only one project or run exists.

Once that works, the next slice is **session/run indexing plus the semantic event reducer**. That is where we can start tracking child sessions and building the quiet live run card.
