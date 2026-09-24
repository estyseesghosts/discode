import { describe, expect, it } from "vitest";

import { RunRegistry } from "./run-registry.js";

describe("RunRegistry", () => {
  it("registers independent runs across multiple projects", () => {
    const registry = new RunRegistry();

    const alpha = registry.registerRoot({
      rootSessionId: "ses_alpha",
      projectDirectory: "/proj/alpha",
    });
    const beta = registry.registerRoot({
      rootSessionId: "ses_beta",
      projectDirectory: "/proj/beta",
    });

    expect(alpha).toEqual({
      rootSessionId: "ses_alpha",
      projectDirectory: "/proj/alpha",
      state: "idle",
      childSessionIds: [],
    });
    expect(beta.projectDirectory).toBe("/proj/beta");
    expect(registry.get("ses_alpha")?.projectDirectory).toBe("/proj/alpha");
    expect(registry.get("ses_beta")?.projectDirectory).toBe("/proj/beta");
    expect(registry.all()).toHaveLength(2);
  });

  it("supports multiple runs in the same directory", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_one",
      projectDirectory: "/proj/shared",
    });
    registry.registerRoot({
      rootSessionId: "ses_two",
      projectDirectory: "/proj/shared",
    });

    const runs = registry.runsInDirectory("/proj/shared");
    expect(runs.map((run) => run.rootSessionId).sort()).toEqual([
      "ses_one",
      "ses_two",
    ]);
    expect(registry.all()).toHaveLength(2);
  });

  it("re-registers idempotently and preserves state and children", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    registry.setState("ses_root", "working");
    registry.indexChildSession("ses_root", "ses_child");

    const again = registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    expect(again.state).toBe("working");
    expect(again.childSessionIds).toEqual(["ses_child"]);
    expect(registry.all()).toHaveLength(1);
  });

  it("rejects re-registering a known root with a different directory", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/old",
    });
    registry.setState("ses_root", "working");
    registry.indexChildSession("ses_root", "ses_child");

    expect(() =>
      registry.registerRoot({
        rootSessionId: "ses_root",
        projectDirectory: "/proj/new",
      }),
    ).toThrow(
      'Root session "ses_root" is already registered with project directory "/proj/old"',
    );

    // Failed re-registration leaves the run untouched.
    expect(registry.get("ses_root")).toEqual({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/old",
      state: "working",
      childSessionIds: ["ses_child"],
    });
    expect(registry.runsInDirectory("/proj/old")).toHaveLength(1);
    expect(registry.runsInDirectory("/proj/new")).toEqual([]);
  });

  it("resolves root and child session IDs to the same root run", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    registry.indexChildSession("ses_root", "ses_child");

    expect(registry.runForSession("ses_root")?.rootSessionId).toBe("ses_root");
    expect(registry.runForSession("ses_child")?.rootSessionId).toBe(
      "ses_root",
    );
    expect(registry.runForSession("ses_unknown")).toBeUndefined();
    expect(registry.runForSession("   ")).toBeUndefined();
  });

  it("indexes children idempotently and reports them on the parent copy", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    registry.indexChildSession("ses_root", "ses_child");
    const again = registry.indexChildSession("ses_root", "ses_child");

    expect(again.childSessionIds).toEqual(["ses_child"]);
    expect(registry.get("ses_root")?.childSessionIds).toEqual(["ses_child"]);
  });

  it("treats indexing the root ID itself as a no-op", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    const run = registry.indexChildSession("ses_root", "ses_root");
    expect(run.childSessionIds).toEqual([]);
  });

  it("removes a root together with its child and directory indexes", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    registry.indexChildSession("ses_root", "ses_child");
    registry.registerRoot({
      rootSessionId: "ses_sibling",
      projectDirectory: "/proj/alpha",
    });

    registry.remove("ses_root");

    expect(registry.get("ses_root")).toBeUndefined();
    expect(registry.runForSession("ses_child")).toBeUndefined();
    expect(registry.runForSession("ses_root")).toBeUndefined();
    expect(
      registry.runsInDirectory("/proj/alpha").map((run) => run.rootSessionId),
    ).toEqual(["ses_sibling"]);
  });

  it("ignores removal of unknown or blank IDs", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    registry.remove("ses_missing");
    registry.remove("   ");

    expect(registry.all()).toHaveLength(1);
  });

  it("transitions known roots through setState", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });

    expect(registry.setState("ses_root", "working").state).toBe("working");
    expect(registry.setState("ses_root", "error").state).toBe("error");
    expect(registry.setState("ses_root", "idle").state).toBe("idle");
  });

  it("returns defensive copies that cannot mutate internal state", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_root",
      projectDirectory: "/proj/alpha",
    });
    registry.indexChildSession("ses_root", "ses_child");

    const fetched = registry.get("ses_root");
    expect(fetched).toBeDefined();
    (fetched as { rootSessionId: string }).rootSessionId = "ses_mutated";
    (fetched as unknown as { childSessionIds: string[] }).childSessionIds.push(
      "ses_injected",
    );

    const reread = registry.get("ses_root");
    expect(reread?.rootSessionId).toBe("ses_root");
    expect(reread?.childSessionIds).toEqual(["ses_child"]);

    const listed = registry.all();
    (listed[0] as { projectDirectory: string }).projectDirectory =
      "/proj/mutated";
    expect(registry.get("ses_root")?.projectDirectory).toBe("/proj/alpha");
  });

  it("rejects blank IDs, unknown roots, and conflicting child mappings", () => {
    const registry = new RunRegistry();
    registry.registerRoot({
      rootSessionId: "ses_a",
      projectDirectory: "/proj/a",
    });
    registry.registerRoot({
      rootSessionId: "ses_b",
      projectDirectory: "/proj/b",
    });
    registry.indexChildSession("ses_a", "ses_child");

    expect(() =>
      registry.registerRoot({
        rootSessionId: "   ",
        projectDirectory: "/proj/a",
      }),
    ).toThrow("Root session ID must not be empty");
    expect(() =>
      registry.registerRoot({
        rootSessionId: "ses_new",
        projectDirectory: "  ",
      }),
    ).toThrow("Project directory must not be empty");
    expect(() => registry.indexChildSession("ses_missing", "ses_x")).toThrow(
      'Unknown root session "ses_missing"',
    );
    expect(() => registry.indexChildSession("ses_a", "  ")).toThrow(
      "Child session ID must not be empty",
    );
    expect(() => registry.indexChildSession("ses_a", "ses_b")).toThrow(
      "already registered as a root",
    );
    expect(() => registry.indexChildSession("ses_b", "ses_child")).toThrow(
      "already indexed under root",
    );
    expect(() =>
      registry.registerRoot({
        rootSessionId: "ses_child",
        projectDirectory: "/proj/c",
      }),
    ).toThrow("already indexed as a child");
    expect(() => registry.setState("ses_missing", "working")).toThrow(
      'Unknown root session "ses_missing"',
    );
    expect(() =>
      // @ts-expect-error - intentionally invalid state
      registry.setState("ses_a", "flying"),
    ).toThrow("Run state must be one of");
  });
});
