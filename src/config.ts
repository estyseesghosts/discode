export interface AppConfig {
  readonly discordToken: string;
  readonly discordClientId: string;
  readonly opencodeUrl: string;
}

export type Environment = Readonly<Record<string, string | undefined>>;

export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`Invalid configuration: ${problems.join(", ")}`);
    this.name = "ConfigError";
    this.problems = [...problems];
  }
}

export function loadConfig(env: Environment): AppConfig {
  const problems: string[] = [];

  const discordToken = readRequired(env, "DISCORD_TOKEN", problems);
  const discordClientId = readRequired(env, "DISCORD_CLIENT_ID", problems);
  const opencodeUrl = readRequired(env, "OPENCODE_URL", problems);

  if (opencodeUrl !== undefined && !isHttpUrl(opencodeUrl)) {
    problems.push("OPENCODE_URL");
  }

  if (
    problems.length > 0 ||
    discordToken === undefined ||
    discordClientId === undefined ||
    opencodeUrl === undefined
  ) {
    throw new ConfigError(problems);
  }

  return {
    discordToken,
    discordClientId,
    opencodeUrl,
  };
}

function readRequired(
  env: Environment,
  key: string,
  problems: string[],
): string | undefined {
  const value = env[key]?.trim();

  if (!value) {
    problems.push(key);
    return undefined;
  }

  return value;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
