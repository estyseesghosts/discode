import { afterEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "./config.js";
import {
  reportStartupFailure,
  startBot,
  type StartBotDependencies,
} from "./bootstrap.js";

const config: AppConfig = {
  discordToken: "discord-token",
  discordClientId: "client-id",
  opencodeUrl: "http://127.0.0.1:4096",
};

function fakeGateway() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    login: vi.fn().mockResolvedValue("logged-in"),
  };
}

function fakeApp(gateway: unknown) {
  const eventsDone = Promise.resolve({
    eventsReceived: 0,
    handlerFailures: 0,
    completed: true,
  });
  return {
    gateway,
    start: vi.fn().mockResolvedValue({ loginResult: "logged-in", eventsDone }),
    eventsDone,
  };
}

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("startBot", () => {
  it("loads config, creates one gateway, and starts the runtime", async () => {
    const gateway = fakeGateway();
    const app = fakeApp(gateway);
    const loadConfigFn = vi.fn().mockReturnValue(config);
    const createGateway = vi.fn().mockReturnValue(gateway);
    const createAppFn = vi.fn().mockReturnValue(app);

    const dependencies: StartBotDependencies = {
      env: {
        DISCORD_TOKEN: "discord-token",
        DISCORD_CLIENT_ID: "client-id",
        OPENCODE_URL: "http://127.0.0.1:4096",
      },
      loadConfigFn,
      createGateway,
      createAppFn,
    };
    const result = await startBot(dependencies);

    expect(loadConfigFn).toHaveBeenCalledTimes(1);
    expect(loadConfigFn).toHaveBeenCalledWith(dependencies.env);
    expect(createGateway).toHaveBeenCalledTimes(1);
    expect(createAppFn).toHaveBeenCalledTimes(1);
    expect(createAppFn).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ gateway }),
    );
    expect(app.start).toHaveBeenCalledTimes(1);
    expect(result.app).toBe(app);
    expect(result.loginResult).toBe("logged-in");
    await expect(result.eventsDone).resolves.toMatchObject({
      completed: true,
    });
  });

  it("propagates config failures without creating a gateway or runtime", async () => {
    const configError = new Error("Invalid configuration: DISCORD_TOKEN");
    const loadConfigFn = vi.fn().mockImplementation(() => {
      throw configError;
    });
    const createGateway = vi.fn();
    const createAppFn = vi.fn();

    await expect(
      startBot({
        env: {},
        loadConfigFn,
        createGateway,
        createAppFn,
      }),
    ).rejects.toBe(configError);

    expect(createGateway).not.toHaveBeenCalled();
    expect(createAppFn).not.toHaveBeenCalled();
  });

  it("propagates startup failures to the caller", async () => {
    const gateway = fakeGateway();
    const loginError = new Error("login failed");
    const app = fakeApp(gateway);
    app.start.mockRejectedValueOnce(loginError);

    await expect(
      startBot({
        env: {},
        loadConfigFn: vi.fn().mockReturnValue(config),
        createGateway: vi.fn().mockReturnValue(gateway),
        createAppFn: vi.fn().mockReturnValue(app),
      }),
    ).rejects.toBe(loginError);
  });

  it("never registers commands on bootstrap", async () => {
    const gateway = fakeGateway();
    const app = fakeApp(gateway);
    const createAppFn = vi.fn().mockReturnValue(app);

    await startBot({
      env: {},
      loadConfigFn: vi.fn().mockReturnValue(config),
      createGateway: vi.fn().mockReturnValue(gateway),
      createAppFn,
    });

    // Bootstrap depends only on config/gateway/runtime — assert by source
    // inspection that no registration call is wired in.
    const { readFile } = await import("node:fs/promises");
    const bootstrapSource = await readFile(
      new URL("./bootstrap.ts", import.meta.url),
      "utf8",
    );
    expect(bootstrapSource).not.toMatch(/registerProjectCommands\s*\(/);
    expect(bootstrapSource).not.toMatch(
      /from\s+["']\.\/register-commands/,
    );
    expect(bootstrapSource).not.toMatch(
      /from\s+["']\.\/discord\/commands/,
    );
  });
});

describe("reportStartupFailure", () => {
  it("sets a non-zero exit code with a generic sanitized message", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "super-secret-token-value";

    reportStartupFailure();

    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalledTimes(1);
    const message = String(error.mock.calls[0]?.[0] ?? "");
    expect(message).toBe("Failed to start the Discord bridge.");
    expect(message).not.toContain(secret);
    expect(message).not.toContain("ses_");
    expect(message).not.toContain("http");
  });
});

describe("index entrypoint side effects", () => {
  it("has no import-time side effects without valid env", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Importing must not load config, log in, or report failure: with empty
    // env a side-effectful import would throw or log.
    await import("./index.js");
    expect(error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
