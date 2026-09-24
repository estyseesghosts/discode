import { OpenCode } from "@opencode/client";

import type { AppConfig } from "../config.js";

/**
 * Shared OpenCode client boundary.
 *
 * One client serves every project directory: callers supply explicit
 * session/location context per operation. Importing this module has no side
 * effects — no client is constructed, no request is sent, and no event
 * subscription or listener is created. The Discord layer owns the single
 * shared instance and injects it where needed; never create one client per
 * channel.
 */

/** Native client type returned by {@link OpenCode.make}. */
export type SharedOpenCodeClient = ReturnType<typeof OpenCode.make>;

/** Injectable factory for the native client (defaults to {@link OpenCode.make}). */
export type OpenCodeMake = (options: {
  readonly baseUrl: string;
}) => SharedOpenCodeClient;

/**
 * Minimal session surface this slice needs from the shared client.
 * Satisfied by the native client; tests inject a mock.
 */
export interface SessionCapableClient {
  readonly session: {
    create(input: {
      readonly location: { readonly directory: string };
    }): Promise<{ readonly id: string }>;
  };
}

// Compile-time guarantee (emits no runtime code): the native client satisfies
// the minimal structural shape, so production code can pass the shared
// instance wherever a `SessionCapableClient` is required.
type AssertTrue<T extends true> = T;
type _NativeClientFits = AssertTrue<
  SharedOpenCodeClient extends SessionCapableClient ? true : false
>;

/** Failure at the OpenCode API boundary. Never leaks transport internals. */
export class OpenCodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "OpenCodeError";
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** Session identity returned when `/run new` creates a root session. */
export interface CreatedSession {
  readonly sessionId: string;
}

/**
 * Construct the one shared OpenCode client from application configuration.
 *
 * Trims and validates `opencodeUrl` (http/https only) before delegating to
 * `make`. The injectable `make` parameter exists so tests can assert the
 * configured base URL without performing network I/O.
 */
export function createOpenCodeClient(
  config: Pick<AppConfig, "opencodeUrl">,
  make: OpenCodeMake = OpenCode.make as OpenCodeMake,
): SharedOpenCodeClient {
  const baseUrl = config?.opencodeUrl?.trim();
  if (!baseUrl) {
    throw new OpenCodeError("OpenCode URL must not be empty");
  }
  if (!isHttpUrl(baseUrl)) {
    throw new OpenCodeError(
      `OpenCode URL must use http or https: "${baseUrl}"`,
    );
  }
  if (typeof make !== "function") {
    throw new OpenCodeError("An OpenCode client factory is required");
  }
  return make({ baseUrl });
}

/**
 * Create a root OpenCode session in an explicit project directory.
 *
 * Uses the shared client — never a per-channel client — and always passes
 * the directory as `location` so one backend can serve many projects.
 * Throws {@link OpenCodeError} for an empty directory, a missing session
 * surface, a transport/API failure, or a response without a session ID.
 */
export async function createSession(
  client: SessionCapableClient,
  directory: string,
): Promise<CreatedSession> {
  if (!client || typeof client.session?.create !== "function") {
    throw new OpenCodeError("An OpenCode client with session support is required");
  }
  const trimmedDirectory = directory?.trim();
  if (!trimmedDirectory) {
    throw new OpenCodeError("Project directory must not be empty");
  }

  let session: { readonly id: string };
  try {
    session = await client.session.create({
      location: { directory: trimmedDirectory },
    });
  } catch (error) {
    throw new OpenCodeError(
      `Could not create an OpenCode session in "${trimmedDirectory}".`,
      { cause: error },
    );
  }

  const sessionId = session?.id?.trim();
  if (!sessionId) {
    throw new OpenCodeError(
      "OpenCode returned a session without an ID.",
    );
  }
  return { sessionId };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
