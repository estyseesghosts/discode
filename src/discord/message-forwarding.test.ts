import { describe, expect, it, vi } from "vitest";

import { BindingStore } from "../bindings/store.js";
import type { SessionCapableClient } from "../opencode/client.js";
import {
  forwardMessage,
  type ForwardableMessage,
} from "./message-forwarding.js";

describe("forwardMessage", () => {
  it("prompts the selected run exactly once with the trimmed text", async () => {
    const store = boundStore("channel-a", "/home/user/alpha", "ses_aaa");
    const client = mockClient();
    const message = humanMessage("channel-a", "  hello root  ");

    const outcome = await forwardMessage(message, store, client);

    expect(outcome).toBe("forwarded");
    expect(client.session.prompt).toHaveBeenCalledTimes(1);
    expect(client.session.prompt).toHaveBeenCalledWith({
      sessionID: "ses_aaa",
      text: "hello root",
    });
  });

  it("needs no reply surface or listener on the message", async () => {
    const store = boundStore("channel-a", "/home/user/alpha", "ses_aaa");
    const client = mockClient();
    // A plain data-only object satisfies the boundary: no reply method,
    // no event emitter, no client factory is ever touched.
    const message: ForwardableMessage = {
      channelId: "channel-a",
      content: "hello",
      author: { bot: false },
    };

    await expect(forwardMessage(message, store, client)).resolves.toBe(
      "forwarded",
    );
    expect(client.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("ignores bot-authored messages", async () => {
    const store = boundStore("channel-a", "/home/user/alpha", "ses_aaa");
    const client = mockClient();

    const outcome = await forwardMessage(
      humanMessage("channel-a", "hello", { bot: true }),
      store,
      client,
    );

    expect(outcome).toBe("ignored");
    expect(client.session.prompt).not.toHaveBeenCalled();
  });

  it("treats a missing author as a human message", async () => {
    const store = boundStore("channel-a", "/home/user/alpha", "ses_aaa");
    const client = mockClient();

    const outcome = await forwardMessage(
      { channelId: "channel-a", content: "hello" },
      store,
      client,
    );

    expect(outcome).toBe("forwarded");
    expect(client.session.prompt).toHaveBeenCalledTimes(1);
  });

  it("ignores missing or blank channel IDs", async () => {
    const store = boundStore("channel-a", "/home/user/alpha", "ses_aaa");
    const client = mockClient();
    for (const channelId of [undefined, null, "  "]) {
      const outcome = await forwardMessage(
        {
          channelId: channelId as string | undefined | null,
          content: "hello",
          author: { bot: false },
        },
        store,
        client,
      );
      expect(outcome).toBe("ignored");
    }
    expect(client.session.prompt).not.toHaveBeenCalled();
  });

  it("ignores blank message content", async () => {
    const store = boundStore("channel-a", "/home/user/alpha", "ses_aaa");
    const client = mockClient();
    for (const content of [undefined, null, "", "   "]) {
      const outcome = await forwardMessage(
        {
          channelId: "channel-a",
          content: content as string | undefined | null,
          author: { bot: false },
        },
        store,
        client,
      );
      expect(outcome).toBe("ignored");
    }
    expect(client.session.prompt).not.toHaveBeenCalled();
  });

  it("ignores unbound channels", async () => {
    const store = new BindingStore();
    const client = mockClient();

    const outcome = await forwardMessage(
      humanMessage("channel-unknown", "hello"),
      store,
      client,
    );

    expect(outcome).toBe("ignored");
    expect(client.session.prompt).not.toHaveBeenCalled();
  });

  it("ignores bound channels with no selected run", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "/home/user/alpha");
    const client = mockClient();

    const outcome = await forwardMessage(
      humanMessage("channel-a", "hello"),
      store,
      client,
    );

    expect(outcome).toBe("ignored");
    expect(client.session.prompt).not.toHaveBeenCalled();
  });

  it("routes independent channels and threads to their own runs", async () => {
    const store = new BindingStore();
    store.attachProject("123456789012345678", "/home/user/parent");
    store.attachRun("123456789012345678", "ses_parent");
    store.attachProject("123456789012345679", "/home/user/thread");
    store.attachRun("123456789012345679", "ses_thread");
    const prompt = vi.fn().mockResolvedValue(undefined);
    const client: SessionCapableClient = {
      session: {
        create: vi.fn().mockResolvedValue({ id: "ses_unused" }),
        prompt,
      },
    };

    expect(
      await forwardMessage(
        humanMessage("123456789012345678", "parent hello"),
        store,
        client,
      ),
    ).toBe("forwarded");
    expect(
      await forwardMessage(
        humanMessage("123456789012345679", "thread hello"),
        store,
        client,
      ),
    ).toBe("forwarded");

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenNthCalledWith(1, {
      sessionID: "ses_parent",
      text: "parent hello",
    });
    expect(prompt).toHaveBeenNthCalledWith(2, {
      sessionID: "ses_thread",
      text: "thread hello",
    });
  });

  it("reports failure safely when OpenCode delivery fails", async () => {
    const store = boundStore("channel-a", "/home/user/alpha", "ses_aaa");
    const prompt = vi
      .fn()
      .mockRejectedValue(
        new Error("connect ECONNREFUSED 127.0.0.1:4096 bearer abc123"),
      );
    const client: SessionCapableClient = {
      session: {
        create: vi.fn().mockResolvedValue({ id: "ses_unused" }),
        prompt,
      },
    };

    const outcome = await forwardMessage(
      humanMessage("channel-a", "hello"),
      store,
      client,
    );

    expect(outcome).toBe("failed");
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("throws only for missing dependencies", async () => {
    const store = new BindingStore();
    const client = mockClient();
    const message = humanMessage("channel-a", "hello");

    await expect(
      // @ts-expect-error - intentionally invalid input
      forwardMessage(null, store, client),
    ).rejects.toThrow("A message, binding store");
    await expect(
      // @ts-expect-error - intentionally invalid input
      forwardMessage(message, null, client),
    ).rejects.toThrow("A message, binding store");
    await expect(
      // @ts-expect-error - intentionally invalid input
      forwardMessage(message, store, null),
    ).rejects.toThrow("A message, binding store");
  });
});

function boundStore(
  channelId: string,
  directory: string,
  runId: string,
): BindingStore {
  const store = new BindingStore();
  store.attachProject(channelId, directory);
  store.attachRun(channelId, runId);
  return store;
}

function mockClient(): SessionCapableClient & {
  session: {
    create: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
  };
} {
  return {
    session: {
      create: vi.fn().mockResolvedValue({ id: "ses_unused" }),
      prompt: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function humanMessage(
  channelId: string,
  content: string,
  author: { bot: boolean } = { bot: false },
): ForwardableMessage {
  return { channelId, content, author };
}
