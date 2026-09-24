import { describe, expect, it, vi } from "vitest";

import { OpenCodeError } from "./client.js";
import {
  consumeOpenCodeEvents,
  eventDirectory,
  eventSessionId,
  type EventCapableClient,
  type OpenCodeEvent,
} from "./events.js";

function stubClient(
  subscribe: EventCapableClient["event"]["subscribe"],
): EventCapableClient {
  return { event: { subscribe } };
}

async function* toStream(events: readonly OpenCodeEvent[]) {
  for (const event of events) {
    yield event;
  }
}

const sessionEvent = {
  type: "session.text.delta",
  location: { directory: "/proj/voxel" },
  data: { sessionID: "ses_abc", delta: "hello" },
} as const;

describe("consumeOpenCodeEvents", () => {
  it("subscribes to the shared event stream exactly once", async () => {
    const subscribe = vi.fn().mockReturnValue(toStream([]));
    const handler = vi.fn();

    await consumeOpenCodeEvents(stubClient(subscribe), handler);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it("forwards the abort signal to the single subscription", async () => {
    const subscribe = vi.fn().mockReturnValue(toStream([]));
    const controller = new AbortController();

    await consumeOpenCodeEvents(stubClient(subscribe), vi.fn(), {
      signal: controller.signal,
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({
      signal: controller.signal,
    });
  });

  it("passes every event to the one handler in stream order", async () => {
    const events = [
      { type: "session.created", data: { sessionID: "ses_one" } },
      { type: "session.text.delta", data: { sessionID: "ses_one" } },
      { type: "session.idle", data: { sessionID: "ses_two" } },
    ] satisfies OpenCodeEvent[];
    const subscribe = vi.fn().mockReturnValue(toStream(events));
    const handler = vi.fn().mockResolvedValue(undefined);

    const result = await consumeOpenCodeEvents(
      stubClient(subscribe),
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, events[0]);
    expect(handler).toHaveBeenNthCalledWith(2, events[1]);
    expect(handler).toHaveBeenNthCalledWith(3, events[2]);
    expect(result).toEqual({
      eventsReceived: 3,
      handlerFailures: 0,
      completed: true,
    });
  });

  it("preserves location/session context and tolerates location-less events", async () => {
    const withLocation = {
      type: "session.text.delta",
      location: { directory: "/proj/voxel" },
      data: { sessionID: "ses_abc", delta: "part one" },
    } satisfies OpenCodeEvent;
    const withoutLocation = {
      type: "server.connected",
      data: {},
    } satisfies OpenCodeEvent;
    const subscribe = vi
      .fn()
      .mockReturnValue(toStream([withLocation, withoutLocation]));
    const seen: OpenCodeEvent[] = [];

    const result = await consumeOpenCodeEvents(stubClient(subscribe), (event) => {
      seen.push(event);
    });

    expect(seen).toEqual([withLocation, withoutLocation]);
    expect(eventSessionId(seen[0])).toBe("ses_abc");
    expect(eventDirectory(seen[0])).toBe("/proj/voxel");
    expect(eventSessionId(seen[1])).toBeUndefined();
    expect(eventDirectory(seen[1])).toBeUndefined();
    expect(result.completed).toBe(true);
  });

  it("resolves a completion summary when the stream ends", async () => {
    const subscribe = vi.fn().mockReturnValue(toStream([sessionEvent]));

    const result = await consumeOpenCodeEvents(
      stubClient(subscribe),
      vi.fn(),
    );

    expect(result).toEqual({
      eventsReceived: 1,
      handlerFailures: 0,
      completed: true,
    });
  });

  it("wraps stream failures without leaking event payloads", async () => {
    const secretDelta = "super-secret-stream-payload-12345";
    async function* failing() {
      yield {
        type: "session.text.delta",
        data: { sessionID: "ses_abc", delta: secretDelta },
      } satisfies OpenCodeEvent;
      throw new Error("connection reset");
    }
    const subscribe = vi.fn().mockReturnValue(failing());
    const seen: OpenCodeEvent[] = [];

    const error = await consumeOpenCodeEvents(stubClient(subscribe), (event) => {
      seen.push(event);
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(OpenCodeError);
    expect((error as Error).message).toContain("after 1 event(s)");
    expect((error as Error).message).not.toContain(secretDelta);
    expect((error as { cause?: unknown }).cause).toBeInstanceOf(Error);
    expect(seen).toHaveLength(1);
  });

  it("wraps subscription failures without calling the handler", async () => {
    const failure = new Error("server unavailable");
    const subscribe = vi.fn().mockImplementation(() => {
      throw failure;
    });
    const handler = vi.fn();

    const error = await consumeOpenCodeEvents(
      stubClient(subscribe),
      handler,
    ).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(OpenCodeError);
    expect((error as Error).message).toContain("subscribe");
    expect((error as { cause?: unknown }).cause).toBe(failure);
    expect(handler).not.toHaveBeenCalled();
  });

  it("isolates handler failures and keeps consuming the stream", async () => {
    const events = [
      { type: "session.created", data: { sessionID: "ses_one" } },
      { type: "session.text.delta", data: { sessionID: "ses_one" } },
      { type: "session.idle", data: { sessionID: "ses_one" } },
    ] satisfies OpenCodeEvent[];
    const subscribe = vi.fn().mockReturnValue(toStream(events));
    const handler = vi
      .fn()
      .mockRejectedValueOnce(new Error("handler blew up: secret-detail"))
      .mockResolvedValue(undefined);

    const result = await consumeOpenCodeEvents(
      stubClient(subscribe),
      handler,
    );

    expect(handler).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      eventsReceived: 3,
      handlerFailures: 1,
      completed: true,
    });
  });

  it("rejects unusable clients and handlers without subscribing", async () => {
    const subscribe = vi.fn();
    await expect(
      // @ts-expect-error - intentionally invalid client
      consumeOpenCodeEvents(null, vi.fn()),
    ).rejects.toThrow("event support is required");
    await expect(
      // @ts-expect-error - intentionally invalid client
      consumeOpenCodeEvents({}, vi.fn()),
    ).rejects.toThrow("event support is required");
    await expect(
      consumeOpenCodeEvents(
        stubClient(subscribe),
        // @ts-expect-error - intentionally invalid handler
        null,
      ),
    ).rejects.toThrow("event handler is required");
    expect(subscribe).not.toHaveBeenCalled();
  });
});

describe("eventSessionId / eventDirectory", () => {
  it("reads V2 data.sessionID and location.directory shapes", () => {
    expect(eventSessionId(sessionEvent)).toBe("ses_abc");
    expect(eventDirectory(sessionEvent)).toBe("/proj/voxel");
  });

  it("returns undefined for missing, blank, or malformed context", () => {
    expect(eventSessionId({ type: "server.connected" })).toBeUndefined();
    expect(eventDirectory({ type: "server.connected" })).toBeUndefined();
    expect(eventSessionId(null)).toBeUndefined();
    expect(eventDirectory(undefined)).toBeUndefined();
    expect(
      eventSessionId({ type: "x", data: { sessionID: "   " } }),
    ).toBeUndefined();
    expect(
      eventDirectory({ type: "x", location: { directory: "   " } }),
    ).toBeUndefined();
    expect(
      eventDirectory({
        type: "x",
        location: { directory: 42 },
      } as unknown as OpenCodeEvent),
    ).toBeUndefined();
  });
});
