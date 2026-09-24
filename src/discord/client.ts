import { Client, GatewayIntentBits } from "discord.js";

import type { DiscordGateway } from "../runtime/app.js";

/**
 * Production Discord gateway boundary.
 *
 * Builds the real discord.js client with the minimum intents the bridge
 * needs (slash-command interactions plus normal message content). Importing
 * this module has no side effects: construction performs no network I/O and
 * never logs in — the runtime calls `login()` explicitly on `start()`.
 * Structural gateway shapes in `src/runtime/app.ts` accept this client
 * without adaptation; tests inject a mock gateway instead.
 */

// Compile-time guarantee (emits no runtime code): the native discord.js
// client satisfies the runtime's minimal gateway shape (`on`/`off`/`login`),
// so production code can pass it to `createApp` without adaptation.
type AssertTrue<T extends true> = T;
type _NativeClientFitsGateway = AssertTrue<
  Client extends DiscordGateway ? true : false
>;

export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
}
