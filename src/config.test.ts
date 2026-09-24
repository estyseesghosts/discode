import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("loads trimmed bot and OpenCode settings", () => {
    expect(
      loadConfig({
        DISCORD_TOKEN: " token ",
        DISCORD_CLIENT_ID: " client-id ",
        OPENCODE_URL: " http://127.0.0.1:4096 ",
      }),
    ).toEqual({
      discordToken: "token",
      discordClientId: "client-id",
      opencodeUrl: "http://127.0.0.1:4096",
    });
  });

  it("ignores runtime binding keys that belong to application state", () => {
    expect(
      loadConfig({
        DISCORD_TOKEN: "token",
        DISCORD_CLIENT_ID: "client-id",
        OPENCODE_URL: "http://127.0.0.1:4096",
        DISCORD_CHANNEL_ID: "should-not-be-read",
        PROJECT_DIRECTORY: "should-not-be-read",
        ROOT_SESSION_ID: "should-not-be-read",
      }),
    ).toEqual({
      discordToken: "token",
      discordClientId: "client-id",
      opencodeUrl: "http://127.0.0.1:4096",
    });
  });

  it("reports all missing settings without exposing values", () => {
    const error = getConfigError({
      DISCORD_TOKEN: " secret-token ",
      DISCORD_CLIENT_ID: " ",
    });

    expect(error.problems).toEqual(["DISCORD_CLIENT_ID", "OPENCODE_URL"]);
    expect(error.message).not.toContain("secret-token");
  });

  it.each([
    "not a URL",
    "ftp://example.com",
    "file:///tmp/project",
  ])("rejects an invalid OpenCode URL: %s", (opencodeUrl) => {
    const error = getConfigError({
      DISCORD_TOKEN: "token",
      DISCORD_CLIENT_ID: "client-id",
      OPENCODE_URL: opencodeUrl,
    });

    expect(error.problems).toEqual(["OPENCODE_URL"]);
  });
});

function getConfigError(env: Parameters<typeof loadConfig>[0]): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) {
      return error;
    }
  }

  throw new Error("Expected loadConfig to throw a ConfigError");
}
