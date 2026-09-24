import type { ChatInputCommandInteraction } from "discord.js";

import type { BindingStore } from "../bindings/store.js";

/**
 * Interaction boundary for `/project attach`.
 *
 * Runtime context is always resolved from the invoking interaction's
 * `channelId` first, then the project directory option, then the shared
 * {@link BindingStore}. No Discord, OpenCode, or bot-startup concerns live
 * here beyond replying to the interaction. Structural (minimal) types keep
 * real discord.js interactions assignable while letting tests inject mocks.
 */

export interface ProjectAttachOptions {
  getSubcommand(): string;
  getString(name: string, required?: boolean): string | null;
}

export interface ProjectAttachReply {
  content: string;
  ephemeral?: boolean;
}

/** Minimal shape of the `/project attach` chat-input interaction. */
export interface ProjectAttachInteraction {
  readonly commandName?: string;
  readonly channelId?: string | null;
  readonly options: ProjectAttachOptions;
  reply(payload: ProjectAttachReply): Promise<unknown>;
}

/** Whether this handler claimed the interaction. */
export type InteractionOutcome = "handled" | "unhandled";

// Compile-time guarantee (emits no runtime code): a real discord.js
// chat-input interaction satisfies the handler's minimal structural shape,
// so production code can pass it in without adaptation.
type AssertTrue<T extends true> = T;
type _RealInteractionFits = AssertTrue<
  ChatInputCommandInteraction extends ProjectAttachInteraction ? true : false
>;

/**
 * Cross-platform absolute-path check for the `directory` option.
 * Accepts POSIX (`/…`), Windows drive (`C:/…`, `C:\\…`), and UNC
 * (`\\\\server\\share`) forms. Never touches the filesystem: existence is
 * not required, so unreachable or not-yet-created directories still attach.
 */
export function isAbsoluteDirectory(value: string): boolean {
  if (value.includes("\0")) {
    return false;
  }
  if (value.startsWith("/")) {
    return true;
  }
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return true;
  }
  // UNC root alone (`\\`) names no server/share, so require more.
  return value.startsWith("\\\\") && value.length > 2;
}

/**
 * Handle a `/project attach` interaction.
 *
 * Returns `"unhandled"` (without replying) when the interaction targets a
 * different command or subcommand, so future subcommands can share a router.
 * Otherwise updates the binding store for `interaction.channelId` and sends
 * exactly one reply, returning `"handled"`: a public success message, or an
 * ephemeral message for missing channel context, a missing/non-absolute
 * directory, or store failures. Reply failures propagate to the caller;
 * store details are never echoed.
 */
export async function handleProjectAttach(
  interaction: ProjectAttachInteraction,
  store: BindingStore,
): Promise<InteractionOutcome> {
  if (!interaction || !store) {
    throw new Error("An interaction and binding store are required");
  }

  if (
    interaction.commandName !== undefined &&
    interaction.commandName !== "project"
  ) {
    return "unhandled";
  }

  let subcommand: string;
  try {
    subcommand = interaction.options.getSubcommand();
  } catch {
    return "unhandled";
  }
  if (subcommand !== "attach") {
    return "unhandled";
  }

  const channelId = interaction.channelId?.trim();
  if (!channelId) {
    await interaction.reply({
      content:
        "This command must be used in a channel or thread, so there is no project to attach.",
      ephemeral: true,
    });
    return "handled";
  }

  let directory: string | null;
  try {
    directory = interaction.options.getString("directory", true);
  } catch {
    directory = null;
  }
  const trimmedDirectory = directory?.trim();
  if (!trimmedDirectory) {
    await interaction.reply({
      content:
        "A project directory is required: `/project attach directory:/absolute/path/to/project`.",
      ephemeral: true,
    });
    return "handled";
  }
  if (!isAbsoluteDirectory(trimmedDirectory)) {
    await interaction.reply({
      content:
        "That directory must be absolute, such as `/home/user/project` or `C:\\code\\project`.",
      ephemeral: true,
    });
    return "handled";
  }

  try {
    store.attachProject(channelId, trimmedDirectory);
  } catch {
    await interaction.reply({
      content:
        "Could not attach this channel to that project directory. Please try again.",
      ephemeral: true,
    });
    return "handled";
  }

  await interaction.reply({
    content: `Attached this channel to \`${trimmedDirectory}\`.`,
  });
  return "handled";
}
