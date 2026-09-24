import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config.js";
import { createApp, type DiscordGateway } from "./app.js";
import type { OpenCodeEvent } from "../opencode/events.js";

const config: AppConfig = {
  discordToken: "discord-token",
  discordClientId: "client-id",
  opencodeUrl: "http://127.0.0.1:4096",
};

async function* toStream(events: readonly OpenCodeEvent[]) {
  for (const event of events) {
    yield event;
  }
}

interface FakeClient {
  session: {
    create: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
  };
  event: { subscribe: ReturnType<typeof vi.fn> };
}

function fakeSharedClient(events: readonly OpenCodeEvent[] = []): FakeClient {
  return {
    session: {
      create: vi.fn().mockImplementation(
        async (input: { location: { directory: string } }) => ({
          id: `ses_for_${input.location.directory.replace(/[^a-z]+/gi, "_")}`,
        }),
      ),
      prompt: vi.fn().mockResolvedValue(undefined),
    },
    event: { subscribe: vi.fn().mockReturnValue(toStream(events)) },
  };
}

function fakeGateway() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listeners = new Map<string, (value: any) => unknown>();
  const gateway: DiscordGateway & {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners: Map<string, (value: any) => unknown>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  } = {
    listeners,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on: vi.fn((event: string, listener: (value: any) => unknown) => {
      listeners.set(event, listener);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    off: vi.fn((event: string, listener: (value: any) => unknown) => {
      if (listeners.get(event) === listener) {
        listeners.delete(event);
      }
    }),
    login: vi.fn().mockResolvedValue("logged-in"),
  };
  return gateway;
}

function mockInteraction(input: {
  commandName?: string;
  channelId?: string | null;
  subcommand?: string;
  directory?: string | null;
}) {
  return {
    commandName: input.commandName,
    channelId: input.channelId ?? "channel-a",
    options: {
      getSubcommand: () => input.subcommand ?? "attach",
      getString: (_name: string, _required?: boolean) =>
        input.directory ?? "/home/user/alpha",
    },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("runtime composition", () => {
  it("creates exactly one shared client from config and logs in once", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    const makeClient = vi.fn().mockReturnValue(shared);

    const app = createApp(config, { gateway, makeClient });
    const { loginResult, eventsDone } = await app.start();

    expect(makeClient).toHaveBeenCalledTimes(1);
    expect(makeClient).toHaveBeenCalledWith({ baseUrl: config.opencodeUrl });
    expect(app.opencode).toBe(shared);
    expect(gateway.login).toHaveBeenCalledTimes(1);
    expect(gateway.login).toHaveBeenCalledWith("discord-token");
    expect(loginResult).toBe("logged-in");
    await expect(eventsDone).resolves.toMatchObject({ completed: true });
  });

  it("registers exactly one interaction listener and one message listener", async () => {
    const gateway = fakeGateway();
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(fakeSharedClient()),
    });

    await app.start();

    expect(gateway.on).toHaveBeenCalledTimes(2);
    expect(gateway.on).toHaveBeenCalledWith(
      "interactionCreate",
      expect.any(Function),
    );
    expect(gateway.on).toHaveBeenCalledWith(
      "messageCreate",
      expect.any(Function),
    );
    expect(app.isStarted).toBe(true);
    await expect(app.eventsDone).resolves.toMatchObject({ completed: true });
  });

  it("routes project attach interactions through the interaction listener", async () => {
    const gateway = fakeGateway();
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(fakeSharedClient()),
    });
    await app.start();

    const listener = gateway.listeners.get("interactionCreate");
    expect(listener).toBeTypeOf("function");
    const interaction = mockInteraction({
      commandName: "project",
      subcommand: "attach",
      channelId: "channel-a",
      directory: "/home/user/alpha",
    });
    await listener!(interaction);

    expect(app.bindings.get("channel-a")?.project.directory).toBe(
      "/home/user/alpha",
    );
    expect(interaction.reply).toHaveBeenCalledTimes(1);
  });

  it("routes run new through the listener and registers the root before selection", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
    });
    app.bindings.attachProject("channel-a", "/home/user/alpha");
    const events: string[] = [];
    const origRegister = app.runs.registerRoot.bind(app.runs);
    const origAttach = app.bindings.attachRun.bind(app.bindings);
    vi.spyOn(app.runs, "registerRoot").mockImplementation((input) => {
      events.push("register");
      return origRegister(input);
    });
    vi.spyOn(app.bindings, "attachRun").mockImplementation(
      (channelId, runId) => {
        events.push("attach");
        return origAttach(channelId, runId);
      },
    );
    await app.start();

    shared.session.create.mockResolvedValueOnce({ id: "ses_ordered" });
    const listener = gateway.listeners.get("interactionCreate");
    const interaction = {
      commandName: "run",
      channelId: "channel-a",
      options: { getSubcommand: () => "new" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    await listener!(interaction);

    expect(shared.session.create).toHaveBeenCalledTimes(1);
    expect(events).toEqual(["register", "attach"]);
    expect(app.runs.get("ses_ordered")?.projectDirectory).toBe(
      "/home/user/alpha",
    );
    expect(app.bindings.get("channel-a")?.activeRunId).toBe("ses_ordered");
  });

  it("ignores unrelated interactions without calling OpenCode", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
    });
    await app.start();

    const listener = gateway.listeners.get("interactionCreate");
    const interaction = {
      commandName: "other",
      channelId: "channel-a",
      options: { getSubcommand: () => "bogus" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    const outcome = await app.handleInteraction(interaction);
    await listener!(interaction);

    expect(outcome).toBe("unhandled");
    expect(shared.session.create).not.toHaveBeenCalled();
    expect(interaction.reply).not.toHaveBeenCalled();
  });

  it("forwards normal messages through the shared client via the message listener", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
    });
    app.bindings.attachProject("channel-a", "/home/user/alpha");
    app.bindings.attachRun("channel-a", "ses_aaa");
    await app.start();

    const listener = gateway.listeners.get("messageCreate");
    const outcome = await listener!({
      channelId: "channel-a",
      content: "hello root",
      author: { bot: false },
    });

    expect(outcome).toBe("forwarded");
    expect(shared.session.prompt).toHaveBeenCalledTimes(1);
    expect(shared.session.prompt).toHaveBeenCalledWith({
      sessionID: "ses_aaa",
      text: "hello root",
    });
  });

  it("keeps independent channels independent through the runtime", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    shared.session.create
      .mockResolvedValueOnce({ id: "ses_aaaa" })
      .mockResolvedValueOnce({ id: "ses_bbbb" });
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
    });
    app.bindings.attachProject("channel-a", "/home/user/alpha");
    app.bindings.attachProject("channel-b", "/home/user/beta");
    await app.start();
    const listener = gateway.listeners.get("interactionCreate");

    for (const channelId of ["channel-a", "channel-b"]) {
      await listener!({
        commandName: "run",
        channelId,
        options: { getSubcommand: () => "new" },
        reply: vi.fn().mockResolvedValue(undefined),
      });
    }

    expect(app.bindings.get("channel-a")?.activeRunId).toBe("ses_aaaa");
    expect(app.bindings.get("channel-b")?.activeRunId).toBe("ses_bbbb");
    expect(app.runs.get("ses_aaaa")?.projectDirectory).toBe(
      "/home/user/alpha",
    );
    expect(app.runs.get("ses_bbbb")?.projectDirectory).toBe("/home/user/beta");
  });

  it("reduces events through the one global consumer", async () => {
    const events: OpenCodeEvent[] = [
      { type: "session.created", data: { sessionID: "ses_e1" } },
    ];
    const gateway = fakeGateway();
    const shared = fakeSharedClient(events);
    const consumeEvents = vi.fn();
    const { consumeOpenCodeEvents } = await import("../opencode/events.js");
    consumeEvents.mockImplementation(
      (
        client: unknown,
        handler: unknown,
        options?: { signal?: AbortSignal },
      ) =>
        consumeOpenCodeEvents(
          client as Parameters<typeof consumeOpenCodeEvents>[0],
          handler as Parameters<typeof consumeOpenCodeEvents>[1],
          options,
        ),
    );
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
      consumeEvents,
    });
    app.runs.registerRoot({
      rootSessionId: "ses_e1",
      projectDirectory: "/home/user/alpha",
    });

    const { eventsDone } = await app.start();
    const result = await eventsDone;

    expect(consumeEvents).toHaveBeenCalledTimes(1);
    expect(shared.event.subscribe).toHaveBeenCalledTimes(1);
    expect(shared.event.subscribe).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    });
    expect(result).toMatchObject({
      eventsReceived: 1,
      handlerFailures: 0,
      completed: true,
    });
    expect(app.runs.get("ses_e1")?.state).toBe("working");
  });

  it("completes finite event streams and exposes startup state", async () => {
    const events: OpenCodeEvent[] = [
      { type: "server.connected" },
      { type: "session.created", data: { sessionID: "ses_x" } },
    ];
    const gateway = fakeGateway();
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(fakeSharedClient(events)),
    });
    expect(app.isStarted).toBe(false);
    expect(app.eventsDone).toBeUndefined();

    const { eventsDone } = await app.start();

    expect(app.isStarted).toBe(true);
    expect(app.eventsDone).toBe(eventsDone);
    await expect(eventsDone).resolves.toEqual({
      eventsReceived: 2,
      handlerFailures: 0,
      completed: true,
    });
  });

  it("isolates reply and delivery failures without breaking the runtime", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    shared.session.prompt.mockRejectedValueOnce(new Error("boom"));
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
    });
    app.bindings.attachProject("channel-a", "/home/user/alpha");
    app.bindings.attachRun("channel-a", "ses_aaa");
    await app.start();

    // Delivery failure surfaces as an outcome, never a throw.
    await expect(
      app.handleMessage({
        channelId: "channel-a",
        content: "hello",
        author: { bot: false },
      }),
    ).resolves.toBe("failed");

    // Reply failure is isolated: the router swallows it instead of throwing.
    const badReply = {
      commandName: "project",
      channelId: "channel-a",
      options: {
        getSubcommand: () => "attach",
        getString: () => "/home/user/alpha",
      },
      reply: vi.fn().mockRejectedValue(new Error("Unknown interaction")),
    };
    await expect(app.handleInteraction(badReply)).resolves.toBe("handled");

    // The runtime still routes the next interaction normally.
    const good = mockInteraction({
      commandName: "project",
      subcommand: "attach",
      channelId: "channel-b",
      directory: "/home/user/beta",
    });
    await expect(app.handleInteraction(good)).resolves.toBe("handled");
    expect(app.bindings.get("channel-b")?.project.directory).toBe(
      "/home/user/beta",
    );
  });

  it("uses the safe selection-failure reply when run registration fails", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    shared.session.create.mockResolvedValueOnce({ id: "ses_reg_fail" });
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
    });
    app.bindings.attachProject("channel-a", "/home/user/alpha");
    vi.spyOn(app.runs, "registerRoot").mockImplementation(() => {
      throw new Error("registry exploded: secret-shard-9");
    });
    await app.start();

    const interaction = {
      commandName: "run",
      channelId: "channel-a",
      options: { getSubcommand: () => "new" },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    const outcome = await app.handleInteraction(interaction);

    expect(outcome).toBe("handled");
    const payload = interaction.reply.mock.calls[0]?.[0] as {
      content: string;
      ephemeral?: boolean;
    };
    expect(payload.ephemeral).toBe(true);
    expect(payload.content).toContain("could not select it");
    expect(payload.content).not.toContain("secret-shard-9");
    expect(app.bindings.get("channel-a")?.activeRunId).toBeUndefined();
  });

  it("rejects invalid config and gateway without network", () => {
    const gateway = fakeGateway();
    expect(() =>
      createApp(
        { ...config, discordToken: "  " },
        { gateway, makeClient: vi.fn() },
      ),
    ).toThrow("validated AppConfig");
    expect(() =>
      createApp(config, {
        // @ts-expect-error - intentionally invalid gateway
        gateway: null,
        makeClient: vi.fn(),
      }),
    ).toThrow("on/off/login");
    expect(() =>
      createApp(config, {
        // @ts-expect-error - gateway without listener removal
        gateway: { on: gateway.on, login: gateway.login },
        makeClient: vi.fn(),
      }),
    ).toThrow("on/off/login");
  });

  it("cleans up and allows retry when Discord login rejects", async () => {
    const gateway = fakeGateway();
    const shared = fakeSharedClient();
    const loginError = new Error("Invalid token");
    gateway.login.mockRejectedValueOnce(loginError);
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(shared),
    });

    await expect(app.start()).rejects.toBe(loginError);

    // Both listeners removed, runtime reset for retry.
    expect(gateway.off).toHaveBeenCalledTimes(2);
    expect(gateway.off).toHaveBeenCalledWith(
      "interactionCreate",
      expect.any(Function),
    );
    expect(gateway.off).toHaveBeenCalledWith(
      "messageCreate",
      expect.any(Function),
    );
    expect(gateway.listeners.size).toBe(0);
    expect(app.isStarted).toBe(false);
    // The aborted consumer observed the abort signal.
    const subscribedWith = shared.event.subscribe.mock.calls[0]?.[0] as
      | { signal?: AbortSignal }
      | undefined;
    expect(subscribedWith?.signal).toBeInstanceOf(AbortSignal);
    expect(subscribedWith?.signal?.aborted).toBe(true);

    // Retry succeeds with exactly one fresh listener pair and one consumer.
    gateway.login.mockResolvedValueOnce("logged-in-again");
    const { loginResult, eventsDone } = await app.start();

    expect(loginResult).toBe("logged-in-again");
    expect(gateway.on).toHaveBeenCalledTimes(4);
    expect(gateway.listeners.size).toBe(2);
    expect(app.isStarted).toBe(true);
    await expect(eventsDone).resolves.toMatchObject({ completed: true });
  });

  it("resolves startup while the event stream fails without an unhandled crash", async () => {
    const gateway = fakeGateway();
    const streamError = new Error("connection reset");
    let resolveLogin!: (value: unknown) => void;
    gateway.login.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    let rejectConsumer!: (error: Error) => void;
    const consumerPromise = new Promise<never>((_resolve, reject) => {
      rejectConsumer = reject;
    });
    const consumeEvents = vi.fn().mockReturnValue(consumerPromise);
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(fakeSharedClient()),
      consumeEvents,
    });

    const startPromise = app.start();
    // The stream fails while Discord login is still pending: the internal
    // observer handles it, so this never surfaces as an unhandled rejection.
    rejectConsumer(streamError);
    resolveLogin("logged-in");
    const { loginResult, eventsDone } = await startPromise;

    expect(consumeEvents).toHaveBeenCalledTimes(1);
    expect(consumeEvents).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      { signal: expect.any(AbortSignal) },
    );
    expect(loginResult).toBe("logged-in");
    await expect(eventsDone).rejects.toBe(streamError);
    await expect(app.eventsDone).rejects.toBe(streamError);
    expect(app.isStarted).toBe(true);
  });

  it("cleans up without logging in when the event consumer throws synchronously", async () => {
    const gateway = fakeGateway();
    const setupError = new Error("subscribe blew up synchronously");
    const consumeEvents = vi.fn().mockImplementation(() => {
      throw setupError;
    });
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(fakeSharedClient()),
      consumeEvents,
    });

    await expect(app.start()).rejects.toBe(setupError);

    expect(gateway.login).not.toHaveBeenCalled();
    expect(gateway.off).toHaveBeenCalledTimes(2);
    expect(gateway.listeners.size).toBe(0);
    expect(app.isStarted).toBe(false);
    expect(app.eventsDone).toBeUndefined();

    // A later start can retry once the consumer works again.
    const { consumeOpenCodeEvents } = await import("../opencode/events.js");
    consumeEvents.mockImplementation(
      (
        client: unknown,
        handler: unknown,
        options?: { signal?: AbortSignal },
      ) =>
        consumeOpenCodeEvents(
          client as Parameters<typeof consumeOpenCodeEvents>[0],
          handler as Parameters<typeof consumeOpenCodeEvents>[1],
          options,
        ),
    );
    const { eventsDone } = await app.start();
    expect(gateway.login).toHaveBeenCalledTimes(1);
    expect(app.isStarted).toBe(true);
    await expect(eventsDone).resolves.toMatchObject({ completed: true });
  });

  it("resets eventsDone across consecutive failed startups and recovers", async () => {
    const gateway = fakeGateway();
    const loginError = new Error("Invalid token");
    const setupError = new Error("subscribe blew up synchronously");
    gateway.login.mockRejectedValueOnce(loginError);
    const consumeEvents = vi.fn().mockResolvedValueOnce({
      eventsReceived: 0,
      handlerFailures: 0,
      completed: true,
    });
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(fakeSharedClient()),
      consumeEvents,
    });

    // First attempt: the consumer starts, then Discord login rejects.
    await expect(app.start()).rejects.toBe(loginError);
    expect(app.isStarted).toBe(false);
    expect(app.eventsDone).toBeUndefined();
    expect(gateway.listeners.size).toBe(0);
    const staleConsumer = consumeEvents.mock.results[0]?.value;

    // Second attempt: the consumer handshake throws synchronously.
    consumeEvents.mockImplementationOnce(() => {
      throw setupError;
    });
    await expect(app.start()).rejects.toBe(setupError);
    expect(gateway.login).toHaveBeenCalledTimes(1);
    expect(app.isStarted).toBe(false);
    expect(app.eventsDone).toBeUndefined();
    expect(app.eventsDone).not.toBe(staleConsumer);
    expect(gateway.listeners.size).toBe(0);

    // Third attempt: everything works and exposes a fresh promise.
    const { consumeOpenCodeEvents } = await import("../opencode/events.js");
    consumeEvents.mockImplementation(
      (
        client: unknown,
        handler: unknown,
        options?: { signal?: AbortSignal },
      ) =>
        consumeOpenCodeEvents(
          client as Parameters<typeof consumeOpenCodeEvents>[0],
          handler as Parameters<typeof consumeOpenCodeEvents>[1],
          options,
        ),
    );
    const { loginResult, eventsDone } = await app.start();

    expect(loginResult).toBe("logged-in");
    expect(consumeEvents).toHaveBeenCalledTimes(3);
    expect(app.eventsDone).toBe(eventsDone);
    expect(eventsDone).not.toBe(staleConsumer);
    expect(app.isStarted).toBe(true);
    await expect(eventsDone).resolves.toMatchObject({ completed: true });
  });

  it("guards against double start", async () => {
    const gateway = fakeGateway();
    const app = createApp(config, {
      gateway,
      makeClient: vi.fn().mockReturnValue(fakeSharedClient()),
    });

    await app.start();
    await expect(app.start()).rejects.toThrow("already started");
    expect(gateway.on).toHaveBeenCalledTimes(2);
    expect(gateway.login).toHaveBeenCalledTimes(1);
  });
});
