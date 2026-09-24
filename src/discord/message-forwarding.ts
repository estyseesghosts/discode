import type { Message } from "discord.js";

import type { BindingStore } from "../bindings/store.js";
import {
  promptSession,
  type SessionCapableClient,
} from "../opencode/client.js";

/**
 * Normal-message forwarding boundary.
 *
 * Forwards ordinary Discord messages to the selected OpenCode root session
 * through the one injected shared client. Resolution order is always channel
 * ID first, then its project binding, then the selected run. This module
 * never constructs an OpenCode client, never reads environment config,
 * creates no listeners, and never replies to normal messages — delivery
 * failures are reported as an outcome for the (future) bot wiring to log.
 * Structural (minimal) types keep real discord.js messages assignable while
 * letting tests inject mocks.
 */

/** Minimal author shape needed for bot filtering. */
export interface ForwardableAuthor {
  readonly bot?: boolean | null;
}

/** Minimal shape of a normal Discord message. */
export interface ForwardableMessage {
  readonly channelId?: string | null;
  readonly content?: string | null;
  readonly author?: ForwardableAuthor | null;
}

/** Whether the message was forwarded, skipped, or failed delivery. */
export type ForwardingOutcome = "forwarded" | "ignored" | "failed";

// Compile-time guarantee (emits no runtime code): a real discord.js message
// satisfies the handler's minimal structural shape, so production code can
// pass it in without adaptation.
type AssertTrue<T extends true> = T;
type _RealMessageFits = AssertTrue<
  Message extends ForwardableMessage ? true : false
>;

/**
 * Forward one normal Discord message to its channel's selected run.
 *
 * Returns `"ignored"` (without calling OpenCode) for bot-authored messages,
 * missing/blank channel IDs, blank content, unbound channels, and channels
 * without a selected run. Returns `"forwarded"` after exactly one
 * `promptSession` call with the selected run/session ID and trimmed text, or
 * `"failed"` when OpenCode delivery fails — failure details are swallowed so
 * nothing leaks. Never throws for routing or delivery conditions; only for
 * missing dependencies.
 */
export async function forwardMessage(
  message: ForwardableMessage,
  store: BindingStore,
  sharedClient: SessionCapableClient,
): Promise<ForwardingOutcome> {
  if (!message || !store || !sharedClient) {
    throw new Error(
      "A message, binding store, and shared OpenCode client are required",
    );
  }

  if (message.author?.bot) {
    return "ignored";
  }

  const channelId = message.channelId?.trim();
  if (!channelId) {
    return "ignored";
  }

  const text = message.content?.trim();
  if (!text) {
    return "ignored";
  }

  const binding = store.get(channelId);
  const runId = binding?.activeRunId?.trim();
  if (!runId) {
    return "ignored";
  }

  try {
    await promptSession(sharedClient, runId, text);
  } catch {
    return "failed";
  }
  return "forwarded";
}
