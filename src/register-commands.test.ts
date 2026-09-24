import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "./config.js";
import {
  reportRegistrationFailure,
  runCommandRegistration,
} from "./register-commands.js";

const config: AppConfig = {
  discordToken: "discord-token",
  discordClientId: "client-id",
  opencodeUrl: "http://127.0.0.1:4096",
};

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("runCommandRegistration", () => {
  it("loads config, builds REST, and registers exactly once", async () => {
    const rest = { put: vi.fn().mockResolvedValue(undefined) };
    const loadConfigFn = vi.fn().mockReturnValue(config);
    const createRest = vi.fn().mockReturnValue(rest);
    const registerFn = vi.fn().mockResolvedValue(undefined);
    const env = {
      DISCORD_TOKEN: "discord-token",
      DISCORD_CLIENT_ID: "client-id",
      OPENCODE_URL: "http://127.0.0.1:4096",
    };

    await runCommandRegistration({ env, loadConfigFn, createRest, registerFn });

    expect(loadConfigFn).toHaveBeenCalledTimes(1);
    expect(loadConfigFn).toHaveBeenCalledWith(env);
    expect(createRest).toHaveBeenCalledTimes(1);
    expect(createRest).toHaveBeenCalledWith("discord-token");
    expect(registerFn).toHaveBeenCalledTimes(1);
    expect(registerFn).toHaveBeenCalledWith({ rest, clientId: "client-id" });
  });

  it("propagates config failures without touching Discord", async () => {
    const configError = new Error("Invalid configuration: DISCORD_TOKEN");
    const createRest = vi.fn();
    const registerFn = vi.fn();

    await expect(
      runCommandRegistration({
        env: {},
        loadConfigFn: () => {
          throw configError;
        },
        createRest,
        registerFn,
      }),
    ).rejects.toBe(configError);

    expect(createRest).not.toHaveBeenCalled();
    expect(registerFn).not.toHaveBeenCalled();
  });

  it("propagates REST failures to the caller", async () => {
    const rest = { put: vi.fn() };
    const restError = new Error("network down: secret-shard-9");

    await expect(
      runCommandRegistration({
        env: {},
        loadConfigFn: vi.fn().mockReturnValue(config),
        createRest: vi.fn().mockReturnValue(rest),
        registerFn: vi.fn().mockRejectedValue(restError),
      }),
    ).rejects.toBe(restError);
  });
});

describe("reportRegistrationFailure", () => {
  it("sets a non-zero exit code with a generic sanitized message", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "super-secret-token-value";

    reportRegistrationFailure();

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    const message = String(error.mock.calls[0]?.[0] ?? "");
    expect(message).toBe("Failed to register Discord commands.");
    expect(message).not.toContain(secret);
    expect(message).not.toMatch(/token|ses_|discord-token|http/i);
  });
});

describe("register-commands entrypoint side effects", () => {
  it("has no import-time side effects without valid env", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Importing must not load config or call Discord: with empty env a
    // side-effectful import would throw or log.
    await import("./register-commands.js");
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
