import { describe, expect, it, vi } from "vitest";

import {
  buildCommandPayload,
  createDiscordRest,
  projectCommand,
  registerProjectCommands,
  runCommand,
} from "./commands.js";

describe("project command definition", () => {
  it("defines a global /project attach command with a required directory option", () => {
    const command = commandByName("project") as {
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

  it("defines a global /run new command without options", () => {
    const command = commandByName("run") as {
      name: string;
      options: Array<{
        type: number;
        name: string;
        options?: unknown[];
      }>;
    };
    expect(command.name).toBe("run");
    expect(command.options).toHaveLength(1);
    expect(command.options[0]?.type).toBe(1); // SUB_COMMAND
    expect(command.options[0]?.name).toBe("new");
    expect(command.options[0]?.options ?? []).toHaveLength(0);
  });

  it("registers both commands in one global payload", () => {
    const payload = buildCommandPayload();
    expect(payload).toHaveLength(2);
    expect(names(payload)).toEqual(["project", "run"]);
  });

  it("exposes the builders without hard-coded runtime IDs", () => {
    for (const command of [projectCommand, runCommand]) {
      const json = JSON.stringify(command.toJSON());
      expect(json).not.toMatch(/[0-9]{17,}/); // no Discord snowflake IDs
      expect(json).not.toContain("ses_");
    }
  });
});

function commandByName(name: string): unknown {
  const payload = buildCommandPayload() as Array<{ name: string }>;
  const command = payload.find((entry) => entry.name === name);
  if (!command) {
    throw new Error(`Expected a ${name} command in the payload`);
  }
  return command;
}

function names(payload: unknown[]): string[] {
  return (payload as Array<{ name: string }>).map((entry) => entry.name);
}

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
