import { REST, Routes, SlashCommandBuilder } from "discord.js";

/**
 * Global `/project attach` and `/run new` command definitions.
 *
 * This module defines the command shapes and exposes an explicit registration
 * function. Importing it has no side effects: nothing is sent to Discord and
 * no client or listener is created. All runtime context (channel, directory,
 * run selection) is resolved later from the invoking interaction.
 */
export const projectCommand = new SlashCommandBuilder()
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
  );

export const runCommand = new SlashCommandBuilder()
  .setName("run")
  .setDescription("Manage this channel's active OpenCode run")
  .addSubcommand((command) =>
    command
      .setName("new")
      .setDescription("Start a fresh OpenCode root session"),
  );

/** Serializable command payload for Discord application-command registration. */
export function buildCommandPayload(): unknown[] {
  return [projectCommand.toJSON(), runCommand.toJSON()];
}

/**
 * Minimal injectable boundary for Discord command registration.
 * Satisfied by discord.js `REST`; tests inject a mock.
 */
export interface CommandRest {
  put(route: string, options: { body: unknown }): Promise<unknown>;
}

export interface RegistrationInput {
  /** Injectable REST-like client (use {@link createDiscordRest} in production). */
  rest: CommandRest;
  /** Application (client) ID commands are registered for. Never a guild ID. */
  clientId: string;
}

/** Build a real discord.js REST client. Kept separate so tests can inject a mock. */
export function createDiscordRest(token: string): CommandRest {
  if (token.trim().length === 0) {
    throw new Error("Discord token must not be empty");
  }
  return new REST({ version: "10" }).setToken(token) as CommandRest;
}

/**
 * Register the global application commands. Registers globally (no guild ID)
 * so every channel/thread resolves its own context at invocation time.
 * Must be called explicitly (e.g. from a deploy script), never on import.
 */
export async function registerProjectCommands(
  input: RegistrationInput,
): Promise<void> {
  if (!input?.rest || typeof input.rest.put !== "function") {
    throw new Error("A REST client with a put method is required");
  }
  if (!input.clientId || input.clientId.trim().length === 0) {
    throw new Error("Discord client ID must not be empty");
  }

  await input.rest.put(
    Routes.applicationCommands(input.clientId),
    { body: buildCommandPayload() },
  );
}
