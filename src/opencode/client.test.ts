import { describe, expect, it, vi } from "vitest";

import {
  OpenCodeError,
  createOpenCodeClient,
  createSession,
  promptSession,
} from "./client.js";

function stubClient(overrides?: {
  create?: (input: {
    readonly location: { readonly directory: string };
  }) => Promise<{ readonly id: string }>;
  prompt?: (input: {
    readonly sessionID: string;
    readonly text: string;
  }) => Promise<unknown>;
}) {
  return {
    session: {
      create:
        overrides?.create ??
        (async () => ({ id: "ses_123" }) as const),
      prompt:
        overrides?.prompt ?? (async () => ({}) as const),
    },
  };
}

describe("createOpenCodeClient", () => {
  it("constructs one client with the configured base URL", () => {
    const make = vi.fn().mockReturnValue(stubClient());
    const client = createOpenCodeClient(
      { opencodeUrl: "http://127.0.0.1:4096" },
      make,
    );

    expect(make).toHaveBeenCalledTimes(1);
    expect(make).toHaveBeenCalledWith({ baseUrl: "http://127.0.0.1:4096" });
    expect(client).toBe(make.mock.results[0]?.value);
  });

  it("trims the configured URL before constructing the client", () => {
    const make = vi.fn().mockReturnValue(stubClient());
    createOpenCodeClient({ opencodeUrl: "  http://127.0.0.1:4096/  " }, make);

    expect(make).toHaveBeenCalledWith({
      baseUrl: "http://127.0.0.1:4096/",
    });
  });

  it("rejects empty, blank, or non-HTTP URLs without calling the factory", () => {
    for (const opencodeUrl of ["", "   ", "ftp://host:21", "not-a-url"]) {
      const make = vi.fn();
      expect(() => createOpenCodeClient({ opencodeUrl }, make)).toThrow(
        OpenCodeError,
      );
      expect(make).not.toHaveBeenCalled();
    }
  });

  it("rejects a missing client factory", () => {
    expect(() =>
      createOpenCodeClient(
        { opencodeUrl: "http://127.0.0.1:4096" },
        // @ts-expect-error - intentionally invalid factory
        null,
      ),
    ).toThrow("An OpenCode client factory is required");
  });
});

describe("createSession", () => {
  it("creates a session with explicit project-directory location", async () => {
    const create = vi.fn().mockResolvedValue({ id: "ses_abc" });
    const result = await createSession(stubClient({ create }), "/proj/voxel");

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      location: { directory: "/proj/voxel" },
    });
    expect(result).toEqual({ sessionId: "ses_abc" });
  });

  it("serves independent directories through the same shared client", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ id: "ses_one" })
      .mockResolvedValueOnce({ id: "ses_two" });
    const client = stubClient({ create });

    const first = await createSession(client, "/proj/a");
    const second = await createSession(client, "/proj/b");

    expect(first).toEqual({ sessionId: "ses_one" });
    expect(second).toEqual({ sessionId: "ses_two" });
    expect(create).toHaveBeenNthCalledWith(1, {
      location: { directory: "/proj/a" },
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      location: { directory: "/proj/b" },
    });
  });

  it("wraps transport/API failures with the directory context", async () => {
    const failure = new Error("connection refused");
    const create = vi.fn().mockRejectedValue(failure);

    const error = await createSession(
      stubClient({ create }),
      "/proj/voxel",
    ).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(OpenCodeError);
    expect((error as Error).message).toContain("/proj/voxel");
    expect((error as { cause?: unknown }).cause).toBe(failure);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("rejects sessions without an ID", async () => {
    for (const id of ["", "   "]) {
      const create = vi.fn().mockResolvedValue({ id });
      await expect(
        createSession(stubClient({ create }), "/proj/voxel"),
      ).rejects.toThrow("without an ID");
    }
  });

  it("rejects empty directories and unusable clients without calling the API", async () => {
    const create = vi.fn();
    for (const directory of ["", "   "]) {
      await expect(
        createSession(stubClient({ create }), directory),
      ).rejects.toThrow("Project directory must not be empty");
    }
    expect(create).not.toHaveBeenCalled();

    await expect(
      // @ts-expect-error - intentionally invalid client
      createSession(null, "/proj/voxel"),
    ).rejects.toThrow("session support is required");
    await expect(
      // @ts-expect-error - intentionally invalid client
      createSession({}, "/proj/voxel"),
    ).rejects.toThrow("session support is required");
  });
});

describe("promptSession", () => {
  it("prompts with the OpenCode V2 sessionID/text payload", async () => {
    const prompt = vi.fn().mockResolvedValue({});
    await promptSession(stubClient({ prompt }), "ses_abc", "hello world");

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith({
      sessionID: "ses_abc",
      text: "hello world",
    });
  });

  it("trims the session ID and text before prompting", async () => {
    const prompt = vi.fn().mockResolvedValue({});
    await promptSession(stubClient({ prompt }), "  ses_abc  ", "  hello  ");

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith({
      sessionID: "ses_abc",
      text: "hello",
    });
  });

  it("prompts independent sessions through the same shared client", async () => {
    const prompt = vi.fn().mockResolvedValue({});
    const client = stubClient({ prompt });

    await promptSession(client, "ses_one", "first message");
    await promptSession(client, "ses_two", "second message");

    expect(prompt).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenNthCalledWith(1, {
      sessionID: "ses_one",
      text: "first message",
    });
    expect(prompt).toHaveBeenNthCalledWith(2, {
      sessionID: "ses_two",
      text: "second message",
    });
  });

  it("rejects empty session IDs and text without calling the API", async () => {
    const prompt = vi.fn();
    for (const sessionId of ["", "   "]) {
      await expect(
        promptSession(stubClient({ prompt }), sessionId, "hello"),
      ).rejects.toThrow("Session ID must not be empty");
    }
    for (const text of ["", "   "]) {
      await expect(
        promptSession(stubClient({ prompt }), "ses_abc", text),
      ).rejects.toThrow("Prompt text must not be empty");
    }
    expect(prompt).not.toHaveBeenCalled();
  });

  it("rejects unusable clients without calling the API", async () => {
    await expect(
      // @ts-expect-error - intentionally invalid client
      promptSession(null, "ses_abc", "hello"),
    ).rejects.toThrow("session support is required");
    await expect(
      // @ts-expect-error - intentionally invalid client
      promptSession({}, "ses_abc", "hello"),
    ).rejects.toThrow("session support is required");
  });

  it("wraps transport/API failures without leaking prompt text", async () => {
    const secretText = "super-secret-prompt-body-12345";
    const failure = new Error("connection refused");
    const prompt = vi.fn().mockRejectedValue(failure);

    const error = await promptSession(
      stubClient({ prompt }),
      "ses_abc",
      secretText,
    ).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(OpenCodeError);
    expect((error as Error).message).toContain("ses_abc");
    expect((error as Error).message).not.toContain(secretText);
    expect((error as { cause?: unknown }).cause).toBe(failure);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
