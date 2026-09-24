import { describe, expect, it, vi } from "vitest";

import {
  buildCommandPayload,
  createDiscordRest,
  projectCommand,
  registerProjectCommands,
} from "./commands.js";

describe("project command definition", () => {
  it("defines a global /project attach command with a required directory option", () => {
    const payload = buildCommandPayload();
    expect(payload).toHaveLength(1);

    const command = payload[0] as {
      name: string;
      description: string;
      options: Array<{
        type: number;
        name: string;
        description: string;
        options: Array<{ name: string; required: boolean }>;
      }>;
    };
    expect(command.name).toBe("project");
    expect(command.options).toHaveLength(1);
    expect(command.options[0]?.type).toBe(1); // SUB_COMMAND
    expect(command.options[0]?.name).toBe("attach");

    const attachOptions = command.options[0]?.options ?? [];
    expect(attachOptions).toHaveLength(1);
    expect(attachOptions[0]).toMatchObject({
      name: "directory",
      required: true,
    });
  });

  it("exposes the builder without hard-coded runtime IDs", () => {
    const json = JSON.stringify(projectCommand.toJSON());
    expect(json).not.toMatch(/[0-9]{17,}/); // no Discord snowflake IDs
    expect(json).not.toContain("ses_");
  });
});

describe("registerProjectCommands", () => {
  it("registers the payload against the global application route", async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    await registerProjectCommands({ rest: { put }, clientId: "client-123" });

    expect(put).toHaveBeenCalledTimes(1);
    const [route, options] = put.mock.calls[0] as [
      string,
      { body: unknown },
    ];
    expect(route).toBe("/applications/client-123/commands");
    expect(options.body).toEqual(buildCommandPayload());
  });

  it("rejects a missing client ID without calling Discord", async () => {
    const put = vi.fn();
    await expect(
      registerProjectCommands({ rest: { put }, clientId: "  " }),
    ).rejects.toThrow("Discord client ID must not be empty");
    expect(put).not.toHaveBeenCalled();
  });

  it("rejects a missing REST client", async () => {
    await expect(
      // @ts-expect-error - intentionally invalid input
      registerProjectCommands({ clientId: "client-123" }),
    ).rejects.toThrow("A REST client with a put method is required");
  });

  it("propagates REST failures to the caller", async () => {
    const put = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(
      registerProjectCommands({ rest: { put }, clientId: "client-123" }),
    ).rejects.toThrow("network down");
  });
});

describe("createDiscordRest", () => {
  it("rejects an empty token without creating a client", () => {
    for (const token of ["", "   "]) {
      expect(() => createDiscordRest(token)).toThrow(
        "Discord token must not be empty",
      );
    }
  });

  it("builds a REST client exposing put for a valid token", () => {
    const rest = createDiscordRest("test-token");
    expect(typeof rest.put).toBe("function");
  });
});
