import type { ChatInputCommandInteraction } from "discord.js";

import type { BindingStore } from "../bindings/store.js";
import {
  createSession,
  type SessionCapableClient,
} from "../opencode/client.js";
import type { InteractionOutcome } from "./interactions.js";

/**
 * Interaction boundary for `/run new`.
 *
 * Runtime context is always resolved from the invoking interaction's
 * `channelId` first, then its project binding, then the shared OpenCode
 * client supplied by injection. The returned root session ID is stored as the
 * channel's opaque selected run ID via the existing
 * `BindingStore.attachRun` operation. This module never constructs an
 * OpenCode client, never reads environment config, and creates no listeners.
 * Structural (minimal) types keep real discord.js interactions assignable
 * while letting tests inject mocks.
 */

export interface RunNewOptions {
  getSubcommand(): string;
}

/** Minimal shape of the `/run new` chat-input interaction. */
export interface RunNewInteraction {
  readonly commandName?: string;
  readonly channelId?: string | null;
  readonly options: RunNewOptions;
  reply(payload: { content: string; ephemeral?: boolean }): Promise<unknown>;
}

// Compile-time guarantee (emits no runtime code): a real discord.js
// chat-input interaction satisfies the handler's minimal structural shape,
// so production code can pass it in without adaptation.
type AssertTrue<T extends true> = T;
type _RealInteractionFits = AssertTrue<
  ChatInputCommandInteraction extends RunNewInteraction ? true : false
>;

/**
 * Structural registrar for newly created root sessions.
 *
 * Satisfied by `RunRegistry` (whose `registerRoot` takes
 * `{ rootSessionId, projectDirectory }`); declared structurally here so the
 * Discord boundary stays independent of the runtime module. The runtime
 * passes its single shared registry; tests inject a spy.
 */
export interface RunRegistrar {
  registerRoot(input: {
    readonly rootSessionId: string;
    readonly projectDirectory: string;
  }): unknown;
}

/**
 * Handle a `/run new` interaction.
 *
 * Returns `"unhandled"` (without replying and without calling OpenCode) when
 * the interaction targets a different command or subcommand. Otherwise sends
 * exactly one reply, returning `"handled"`: an ephemeral message for missing
 * channel context, an unbound channel, or OpenCode/store failures; or a
 * public success message containing the new root session ID. The shared
 * client is called exactly once per handled, bound interaction. When
 * `runRegistrar` is supplied, the new root session is registered there
 * (e.g. the runtime's shared `RunRegistry`) after OpenCode creation but
 * before channel selection; registration failures use the same safe
 * ephemeral selection-failure reply as store failures and never echo
 * details. OpenCode, registration, and store failure details are never
 * echoed. Reply failures propagate to the caller.
 */
export async function handleRunNew(
  interaction: RunNewInteraction,
  store: BindingStore,
  sharedClient: SessionCapableClient,
  runRegistrar?: RunRegistrar | null,
): Promise<InteractionOutcome> {
  if (!interaction || !store || !sharedClient) {
    throw new Error(
      "An interaction, binding store, and shared OpenCode client are required",
    );
  }

  if (
    interaction.commandName !== undefined &&
    interaction.commandName !== "run"
  ) {
    return "unhandled";
  }

  let subcommand: string;
  try {
    subcommand = interaction.options.getSubcommand();
  } catch {
    return "unhandled";
  }
  if (subcommand !== "new") {
    return "unhandled";
  }

  const channelId = interaction.channelId?.trim();
  if (!channelId) {
    await interaction.reply({
      content:
        "This command must be used in a channel or thread, so there is no run to start.",
      ephemeral: true,
    });
    return "handled";
  }

  const binding = store.get(channelId);
  if (!binding) {
    await interaction.reply({
      content:
        "This channel is not attached to a project. Use `/project attach` first.",
      ephemeral: true,
    });
    return "handled";
  }

  let sessionId: string;
  try {
    ({ sessionId } = await createSession(
      sharedClient,
      binding.project.directory,
    ));
  } catch {
    await interaction.reply({
      content:
        "Could not start a new run for this channel's project. Please try again.",
      ephemeral: true,
    });
    return "handled";
  }

  try {
    await runRegistrar?.registerRoot({
      rootSessionId: sessionId,
      projectDirectory: binding.project.directory,
    });
  } catch {
    await interaction.reply({
      content:
        "The run started, but this channel could not select it. Please try again.",
      ephemeral: true,
    });
    return "handled";
  }

  try {
    store.attachRun(channelId, sessionId);
  } catch {
    await interaction.reply({
      content:
        "The run started, but this channel could not select it. Please try again.",
      ephemeral: true,
    });
    return "handled";
  }

  await interaction.reply({
    content: `Started run \`${sessionId}\`.`,
  });
  return "handled";
}
