import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * Process-script wiring boundary.
 *
 * Both live entrypoints must load `.env` through the Node/tsx-supported
 * `--env-file=.env` flag so `loadConfig(process.env)` sees the README's
 * required `.env` file. This test reads `package.json` only — it never
 * creates, writes, or commits a real `.env`.
 */

interface PackageScripts {
  scripts?: Record<string, string>;
}

async function loadScripts(): Promise<Record<string, string>> {
  const raw = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  const parsed = JSON.parse(raw) as PackageScripts;
  return parsed.scripts ?? {};
}

describe("live process scripts", () => {
  it("loads .env via --env-file for bot startup", async () => {
    const scripts = await loadScripts();
    expect(scripts.start).toContain("--env-file=.env");
    expect(scripts.start).toContain("src/index.ts");
  });

  it("loads .env via --env-file for command registration", async () => {
    const scripts = await loadScripts();
    expect(scripts["register-commands"]).toContain("--env-file=.env");
    expect(scripts["register-commands"]).toContain("src/register-commands.ts");
  });

  it("keeps command registration separate from bot startup", async () => {
    const scripts = await loadScripts();
    expect(scripts.start).not.toContain("register-commands");
  });
});
