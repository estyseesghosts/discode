import { describe, expect, it } from "vitest";

import type { OpenCodeEvent } from "../opencode/events.js";
import { RunRegistry } from "./run-registry.js";
import {
  eventParentId,
  ingestOpenCodeEvent,
  reduceRunState,
} from "./run-state.js";

function sessionEvent(
  type: string,
  sessionID?: string,
  extra?: Record<string, unknown>,
  directory?: string,
): OpenCodeEvent {
  return {
    type,
    ...(directory === undefined
      ? {}
      : { location: { directory } }),
    data: { ...(sessionID === undefined ? {} : { sessionID }), ...extra },
  };
}

function directoryEvent(type: string, directory: string): OpenCodeEvent {
  return { type, location: { directory }, data: {} };
}

describe("reduceRunState", () => {
  it("maps activity events to working", () => {
    expect(reduceRunState("idle", sessionEvent("session.created", "s"))).toBe(
      "working",
    );
    expect(
      reduceRunState("idle", sessionEvent("session.text.delta", "s")),
    ).toBe("working");
    expect(
      reduceRunState("idle", sessionEvent("message.part.updated", "s")),
    ).toBe("working");
    expect(reduceRunState("idle", sessionEvent("tool.execute", "s"))).toBe(
      "working",
    );
    expect(reduceRunState("error", sessionEvent("part.updated", "s"))).toBe(
      "working",
    );
  });

  it("maps session.idle to idle from any state", () => {
    expect(reduceRunState("working", sessionEvent("session.idle", "s"))).toBe(
      "idle",
    );
    expect(reduceRunState("error", sessionEvent("session.idle", "s"))).toBe(
      "idle",
    );
    expect(reduceRunState("idle", sessionEvent("session.idle", "s"))).toBe(
      "idle",
    );
  });

  it("maps error-class events to error and recovers on later events", () => {
    expect(reduceRunState("working", sessionEvent("session.error", "s"))).toBe(
      "error",
    );
    expect(reduceRunState("idle", sessionEvent("server.error", "s"))).toBe(
      "error",
    );
    // Recovery is explicit: activity -> working, idle -> idle.
    expect(
      reduceRunState("error", sessionEvent("session.text.delta", "s")),
    ).toBe("working");
    expect(reduceRunState("error", sessionEvent("session.idle", "s"))).toBe(
      "idle",
    );
  });

  it("leaves unknown event types unchanged", () => {
    expect(
      reduceRunState("working", sessionEvent("server.connected", "s")),
    ).toBe("working");
    expect(reduceRunState("idle", sessionEvent("frobnicate.banana", "s"))).toBe(
      "idle",
    );
  });

  it("is total over malformed or missing event shapes", () => {
    expect(reduceRunState("working", null)).toBe("working");
    expect(reduceRunState("working", undefined)).toBe("working");
    expect(reduceRunState("idle", { type: "server.connected" })).toBe("idle");
    expect(reduceRunState("idle", { type: "   " })).toBe("idle");
    expect(
      reduceRunState("idle", { type: 42 } as unknown as OpenCodeEvent),
    ).toBe("idle");
    expect(reduceRunState("idle", {} as OpenCodeEvent)).toBe("idle");
  });

  it("is deterministic for repeated inputs", () => {
    const event = sessionEvent("session.text.delta", "s");
    expect(reduceRunState("idle", event)).toBe(
      reduceRunState("idle", { ...event, data: { ...event.data } }),
    );
  });

  it("rejects an invalid previous state", () => {
    expect(() =>
      // @ts-expect-error - intentionally invalid previous state
      reduceRunState("flying", sessionEvent("session.idle", "s")),
    ).toThrow("Previous run state");
  });
});

describe("eventParentId", () => {
  it("reads parentID and parentId variants and trims blanks", () => {
    expect(
      eventParentId({
        type: "session.created",
        data: { sessionID: "child", parentID: "ses_root" },
      }),
    ).toBe("ses_root");
    expect(
      eventParentId({
        type: "session.created",
        data: { sessionID: "child", parentId: "ses_root" },
      }),
    ).toBe("ses_root");
    expect(
      eventParentId({ type: "x", data: { parentID: "   " } }),
    ).toBeUndefined();
    expect(
      eventParentId({ type: "x", data: { parentID: 42 } as never }),
    ).toBeUndefined();
    expect(eventParentId({ type: "x" })).toBeUndefined();
    expect(eventParentId(null)).toBeUndefined();
  });
});

describe("ingestOpenCodeEvent", () => {
  it("updates a known root session event", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    const outcome = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_root", undefined, "/proj/alpha"),
    );

    expect(outcome.status).toBe("updated");
    expect(outcome.reason).toBe("known-session");
    expect(outcome.run?.rootSessionId).toBe("ses_root");
    expect(outcome.run?.state).toBe("working");
    expect(registry.get("ses_root")?.state).toBe("working");
  });

  it("routes a known child session to its parent root", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    registry.indexChildSession("ses_root", "ses_child");

    const outcome = ingestOpenCodeEvent(
      registry,
      sessionEvent("message.part.updated", "ses_child"),
    );

    expect(outcome).toMatchObject({
      status: "updated",
      reason: "known-session",
    });
    expect(outcome.run?.rootSessionId).toBe("ses_root");
    expect(registry.get("ses_root")?.state).toBe("working");
  });

  it("prefers a known session over a contradictory location", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_a",
      projectDirectory: "/proj/a",
    });
    registry.registerRoot({
      rootSessionId: "ses_b",
      projectDirectory: "/proj/b",
    });

    const outcome = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_a", undefined, "/proj/b"),
    );

    expect(outcome.run?.rootSessionId).toBe("ses_a");
    expect(registry.get("ses_a")?.state).toBe("working");
    expect(registry.get("ses_b")?.state).toBe("idle");
  });

  it("indexes an unknown session with a known parent and reduces it", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    const outcome = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_new_child", {
        parentID: "ses_root",
      }),
    );

    expect(outcome.status).toBe("updated");
    expect(outcome.reason).toBe("child-indexed");
    expect(outcome.run?.rootSessionId).toBe("ses_root");
    expect(registry.runForSession("ses_new_child")?.rootSessionId).toBe(
      "ses_root",
    );
    expect(registry.get("ses_root")?.state).toBe("working");
  });

  it("flattens a grandchild onto its root when the parent is a known child", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    registry.indexChildSession("ses_root", "ses_child");

    const outcome = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_grandchild", {
        parentID: "ses_child",
      }),
    );

    expect(outcome.status).toBe("updated");
    expect(outcome.reason).toBe("child-indexed");
    expect(outcome.run?.rootSessionId).toBe("ses_root");
    expect(registry.runForSession("ses_grandchild")?.rootSessionId).toBe(
      "ses_root",
    );
    expect(
      registry.get("ses_root")?.childSessionIds.slice().sort(),
    ).toEqual(["ses_child", "ses_grandchild"]);
    expect(registry.get("ses_root")?.state).toBe("working");
  });

  it("ignores unknown sessions without a known parent, even with a directory", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    const noParent = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_stranger", undefined, "/proj/alpha"),
    );
    const unknownParent = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_stranger", {
        parentID: "ses_ghost",
      }),
    );

    expect(noParent.status).toBe("ignored");
    expect(noParent.reason).toBe("unknown-session");
    expect(noParent.run).toBeUndefined();
    expect(unknownParent).toMatchObject({
      status: "ignored",
      reason: "unknown-parent",
    });
    // Never auto-discovered.
    expect(registry.runForSession("ses_stranger")).toBeUndefined();
    expect(registry.all()).toHaveLength(1);
    expect(registry.get("ses_root")?.state).toBe("idle");
  });

  it("matches a session-less event only when the directory is unambiguous", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    const outcome = ingestOpenCodeEvent(
      registry,
      directoryEvent("session.text.delta", "/proj/alpha"),
    );

    expect(outcome).toMatchObject({
      status: "updated",
      reason: "directory-match",
    });
    expect(outcome.run?.rootSessionId).toBe("ses_root");
    expect(registry.get("ses_root")?.state).toBe("working");
  });

  it("ignores ambiguous or unmatched directory-only events", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_one",
      projectDirectory: "/proj/shared",
    });
    registry.registerRoot({
      rootSessionId: "ses_two",
      projectDirectory: "/proj/shared",
    });

    const ambiguous = ingestOpenCodeEvent(
      registry,
      directoryEvent("session.text.delta", "/proj/shared"),
    );
    const unmatched = ingestOpenCodeEvent(
      registry,
      directoryEvent("session.text.delta", "/proj/nowhere"),
    );

    expect(ambiguous).toMatchObject({
      status: "ignored",
      reason: "ambiguous-directory",
    });
    expect(unmatched).toMatchObject({
      status: "ignored",
      reason: "unmatched-directory",
    });
    expect(registry.get("ses_one")?.state).toBe("idle");
    expect(registry.get("ses_two")?.state).toBe("idle");
  });

  it("ignores location/session-less and malformed events", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    expect(
      ingestOpenCodeEvent(registry, { type: "server.connected" }).status,
    ).toBe("ignored");
    expect(
      ingestOpenCodeEvent(registry, { type: "server.connected" }).reason,
    ).toBe("no-context");
    expect(ingestOpenCodeEvent(registry, null)).toMatchObject({
      status: "ignored",
      reason: "malformed-event",
    });
    expect(ingestOpenCodeEvent(registry, undefined)).toMatchObject({
      status: "ignored",
      reason: "malformed-event",
    });
    expect(registry.get("ses_root")?.state).toBe("idle");
  });

  it("keeps multiple projects independent", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_a",
      projectDirectory: "/proj/a",
    });
    registry.registerRoot({
      rootSessionId: "ses_b",
      projectDirectory: "/proj/b",
    });

    ingestOpenCodeEvent(registry, sessionEvent("session.error", "ses_a"));
    ingestOpenCodeEvent(registry, sessionEvent("session.idle", "ses_b"));

    expect(registry.get("ses_a")?.state).toBe("error");
    expect(registry.get("ses_b")?.state).toBe("idle");
  });

  it("is deterministic for repeated ingestion", () => {
    const first = new RunRegistry();
    first.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    const second = new RunRegistry();
    second.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    const event = sessionEvent("session.text.delta", "ses_root");
    const one = ingestOpenCodeEvent(first, event);
    const two = ingestOpenCodeEvent(second, { ...event });

    expect(one).toEqual(two);
    expect(first.get("ses_root")).toEqual(second.get("ses_root"));
  });

  it("returns defensive outcomes that cannot mutate registry state", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    const outcome = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_root"),
    );
    (outcome as { run?: { state?: string } }).run!.state = "error";
    (outcome.run as unknown as { childSessionIds: string[] })
      .childSessionIds.push("ses_injected");

    expect(registry.get("ses_root")?.state).toBe("working");
    expect(registry.get("ses_root")?.childSessionIds).toEqual([]);
  });

  it("never retains message text or event payloads in outcomes", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    const secret = "super-secret-payload-987654321";

    const outcome = ingestOpenCodeEvent(
      registry,
      sessionEvent("session.text.delta", "ses_root", { delta: secret }),
    );

    expect(JSON.stringify(outcome)).not.toContain(secret);
    expect(JSON.stringify(registry.get("ses_root"))).not.toContain(secret);
  });

  it("requires a registry instance", () => {
    const event = sessionEvent("session.idle", "ses_root");
    expect(() =>
      ingestOpenCodeEvent(
        null as unknown as RunRegistry,
        event,
      ),
    ).toThrow("A run registry is required");
  });
});
