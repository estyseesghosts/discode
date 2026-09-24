import { describe, expect, it, vi } from "vitest";

import {
  OpenCodeError,
  createOpenCodeClient,
  createSession,
} from "./client.js";

function stubClient(overrides?: {
  create?: (input: {
    readonly location: { readonly directory: string };
  }) => Promise<{ readonly id: string }>;
}) {
  return {
    session: {
      create:
        overrides?.create ??
        (async () => ({ id: "ses_123" }) as const),
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
