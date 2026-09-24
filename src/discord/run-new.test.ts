import { describe, expect, it, vi } from "vitest";

import { BindingStore } from "../bindings/store.js";
import type { SessionCapableClient } from "../opencode/client.js";
import { handleRunNew, type RunNewInteraction } from "./run-new.js";

describe("handleRunNew", () => {
  it("creates one session in the bound directory and selects it", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    const client = mockClient({ sessionId: "ses_1234" });
    const interaction = mockInteraction({ channelId: "channel-a" });

    const outcome = await handleRunNew(interaction, store, client);

    expect(outcome).toBe("handled");
    expect(client.session.create).toHaveBeenCalledTimes(1);
    expect(client.session.create).toHaveBeenCalledWith({
      location: { directory: "/home/user/alpha" },
    });
    expect(store.get("channel-a")?.activeRunId).toBe("ses_1234");
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("ses_1234"),
    });
  });

  it("keeps independent channel contexts independent", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    store.attachProject("channel-b", "/home/user/beta");
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: "ses_aaaa" })
      .mockResolvedValueOnce({ id: "ses_bbbb" });
    const client: SessionCapableClient = { session: { create } };

    await handleRunNew(mockInteraction({ channelId: "channel-a" }), store, client);
    await handleRunNew(mockInteraction({ channelId: "channel-b" }), store, client);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      location: { directory: "/home/user/alpha" },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      location: { directory: "/home/user/beta" },
    });
    expect(store.get("channel-a")?.activeRunId).toBe("ses_aaaa");
    expect(store.get("channel-b")?.activeRunId).toBe("ses_bbbb");
  });

  it("replaces the previously selected run", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    store.attachRun("channel-a", "ses_old");
    const client = mockClient({ sessionId: "ses_new" });

    await handleRunNew(
      mockInteraction({ channelId: "channel-a" }),
      store,
      client,
    );

    expect(store.get("channel-a")).toMatchObject({
      discordChannelId: "channel-a",
      project: { directory: "/home/user/alpha" },
      activeRunId: "ses_new",
    });
  });

  it("replies ephemerally for an unbound channel without calling OpenCode", async () => {
    const store = new BindingStore();
    const client = mockClient({ sessionId: "ses_1234" });
    const interaction = mockInteraction({ channelId: "channel-unknown" });

    const outcome = await handleRunNew(interaction, store, client);

    expect(outcome).toBe("handled");
    expect(client.session.create).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: expect.stringContaining("not attached to a project"),
      ephemeral: true,
    });
  });

  it("replies ephemerally when the channel context is missing", async () => {
    const store = new BindingStore();
    const client = mockClient({ sessionId: "ses_1234" });
    for (const channelId of [undefined, null, "  "]) {
      const interaction = mockInteraction({
        channelId: channelId as string | undefined | null,
      });

      const outcome = await handleRunNew(interaction, store, client);

      expect(outcome).toBe("handled");
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("channel or thread"),
        ephemeral: true,
      });
    }
    expect(client.session.create).not.toHaveBeenCalled();
  });

  it("replies ephemerally on OpenCode failure without leaking details", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    const create = vi
      .fn()
      .mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:4096 bearer abc123"));
    const client: SessionCapableClient = { session: { create } };
    const interaction = mockInteraction({ channelId: "channel-a" });

    const outcome = await handleRunNew(interaction, store, client);

    expect(outcome).toBe("handled");
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(interaction.reply).mock.calls[0]?.[0];
    expect(payload).toMatchObject({ ephemeral: true });
    expect(payload?.content).toContain("Could not start a new run");
    expect(payload?.content).not.toContain("ECONNREFUSED");
    expect(payload?.content).not.toContain("abc123");
    expect(store.get("channel-a")?.activeRunId).toBeUndefined();
  });

  it("replies ephemerally on store failure without leaking details", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    vi.spyOn(store, "attachRun").mockImplementation(() => {
      throw new Error("internal store invariant violated at shard 7");
    });
    const client = mockClient({ sessionId: "ses_1234" });
    const interaction = mockInteraction({ channelId: "channel-a" });

    const outcome = await handleRunNew(interaction, store, client);

    expect(outcome).toBe("handled");
    expect(client.session.create).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(interaction.reply).mock.calls[0]?.[0];
    expect(payload).toMatchObject({ ephemeral: true });
    expect(payload?.content).not.toContain("shard 7");
  });

  it("leaves other commands and subcommands unhandled without replying", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    const client = mockClient({ sessionId: "ses_1234" });
    const otherCommand = mockInteraction({
      commandName: "project",
      channelId: "channel-a",
    });
    const otherSubcommand = mockInteraction({
      channelId: "channel-a",
      subcommand: "attach",
    });

    expect(await handleRunNew(otherCommand, store, client)).toBe("unhandled");
    expect(await handleRunNew(otherSubcommand, store, client)).toBe(
      "unhandled",
    );
    expect(otherCommand.reply).not.toHaveBeenCalled();
    expect(otherSubcommand.reply).not.toHaveBeenCalled();
    expect(client.session.create).not.toHaveBeenCalled();
    expect(store.get("channel-a")?.activeRunId).toBeUndefined();
  });

  it("propagates reply failures to the caller", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    const client = mockClient({ sessionId: "ses_1234" });
    const interaction = mockInteraction({ channelId: "channel-a" });
    vi.mocked(interaction.reply).mockRejectedValue(
      new Error("Unknown interaction"),
    );

    await expect(handleRunNew(interaction, store, client)).rejects.toThrow(
      "Unknown interaction",
    );
  });

  it("registers the new root before selecting it when a registrar is supplied", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    const client = mockClient({ sessionId: "ses_1234" });
    const events: string[] = [];
    const registrar = {
      registerRoot: vi.fn().mockImplementation(() => {
        events.push("register");
        return undefined;
      }),
    };
    vi.spyOn(store, "attachRun").mockImplementation((channelId, runId) => {
      events.push("attach");
      return BindingStore.prototype.attachRun.call(store, channelId, runId);
    });

    const outcome = await handleRunNew(
      mockInteraction({ channelId: "channel-a" }),
      store,
      client,
      registrar,
    );

    expect(outcome).toBe("handled");
    expect(registrar.registerRoot).toHaveBeenCalledTimes(1);
    expect(registrar.registerRoot).toHaveBeenCalledWith({
      rootSessionId: "ses_1234",
      projectDirectory: "/home/user/alpha",
    });
    expect(events).toEqual(["register", "attach"]);
    expect(store.get("channel-a")?.activeRunId).toBe("ses_1234");
  });

  it("uses the safe selection-failure reply when registration fails", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    const client = mockClient({ sessionId: "ses_1234" });
    const attachRun = vi.spyOn(store, "attachRun");
    const registrar = {
      registerRoot: vi.fn().mockImplementation(() => {
        throw new Error("registry exploded: secret-shard-9");
      }),
    };
    const interaction = mockInteraction({ channelId: "channel-a" });

    const outcome = await handleRunNew(
      interaction,
      store,
      client,
      registrar,
    );

    expect(outcome).toBe("handled");
    expect(attachRun).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(interaction.reply).mock.calls[0]?.[0];
    expect(payload).toMatchObject({ ephemeral: true });
    expect(payload?.content).toContain("could not select it");
    expect(payload?.content).not.toContain("secret-shard-9");
    expect(store.get("channel-a")?.activeRunId).toBeUndefined();
  });
});

function mockClient(input: { sessionId: string }): SessionCapableClient & {
  session: { create: ReturnType<typeof vi.fn> };
} {
  return {
    session: { create: vi.fn().mockResolvedValue({ id: input.sessionId }) },
  };
}

function mockInteraction(input: {
  commandName?: string;
  channelId?: string | null;
  subcommand?: string;
}): RunNewInteraction & { reply: ReturnType<typeof vi.fn> } {
  const channelId =
    "channelId" in input ? input.channelId : ("channel-a" as const);
  return {
    commandName: input.commandName ?? "run",
    channelId,
    options: {
      getSubcommand: () => input.subcommand ?? "new",
    },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}
