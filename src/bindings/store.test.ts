import { describe, expect, it } from "vitest";

import { BindingStore } from "./store.js";

describe("BindingStore", () => {
  it("attaches independent projects to independent channel contexts", () => {
    const store = new BindingStore();

    store.attachProject("channel-a", "C:/code/alpha");
    store.attachProject("channel-b", "C:/code/beta");

    expect(store.get("channel-a")?.project.directory).toBe("C:/code/alpha");
    expect(store.get("channel-b")?.project.directory).toBe("C:/code/beta");
  });

  it("replaces the project and clears run selection on re-attach", () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "C:/code/old");
    store.attachRun("channel-a", "run-old");
    store.setStatusMessage("channel-a", "message-old");

    const binding = store.attachProject("channel-a", "C:/code/new");

    expect(binding).toEqual({
      discordChannelId: "channel-a",
      project: { directory: "C:/code/new" },
    });
    expect(store.get("channel-a")?.activeRunId).toBeUndefined();
    expect(store.get("channel-a")?.statusMessageId).toBeUndefined();
  });

  it("replaces the selected run without affecting another context", () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "C:/code/alpha");
    store.attachProject("channel-b", "C:/code/alpha");

    store.attachRun("channel-a", "run-1");
    store.attachRun("channel-a", "run-2");
    store.attachRun("channel-b", "run-1");

    expect(store.get("channel-a")?.activeRunId).toBe("run-2");
    expect(store.get("channel-b")?.activeRunId).toBe("run-1");
  });

  it("allows multiple contexts to select the same run without owning it", () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "C:/code/alpha");
    store.attachProject("channel-b", "C:/code/alpha");

    store.attachRun("channel-a", "run-shared");
    store.attachRun("channel-b", "run-shared");
    store.detachProject("channel-a");

    expect(store.get("channel-a")).toBeUndefined();
    expect(store.get("channel-b")?.activeRunId).toBe("run-shared");
  });

  it("clears only the run when the run is detached", () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "C:/code/alpha");
    store.attachRun("channel-a", "run-1");

    store.detachRun("channel-a");

    expect(store.get("channel-a")).toEqual({
      discordChannelId: "channel-a",
      project: { directory: "C:/code/alpha" },
    });
  });

  it("supports status message IDs independently per context", () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "C:/code/alpha");
    store.attachProject("channel-b", "C:/code/beta");

    store.setStatusMessage("channel-a", "message-a");
    store.setStatusMessage("channel-b", "message-b");

    expect(store.get("channel-a")?.statusMessageId).toBe("message-a");
    expect(store.get("channel-b")?.statusMessageId).toBe("message-b");
  });

  it("returns defensive copies from reads and all", () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "C:/code/alpha");

    const binding = store.get("channel-a");
    if (binding === undefined) {
      throw new Error("Expected an attached binding");
    }
    binding.project.directory = "C:/code/mutated";

    expect(store.get("channel-a")?.project.directory).toBe("C:/code/alpha");

    const allBindings = [...store.all()];
    expect(allBindings).toHaveLength(1);
    if (allBindings[0] === undefined) {
      throw new Error("Expected an attached binding");
    }
    allBindings[0].project.directory = "C:/code/also-mutated";
    expect(store.get("channel-a")?.project.directory).toBe("C:/code/alpha");
  });

  it("throws for run and status operations on an unbound context", () => {
    const store = new BindingStore();

    expect(() => store.attachRun("unknown", "run-1")).toThrow(
      "Discord channel unknown is not attached to a project",
    );
    expect(() => store.detachRun("unknown")).toThrow(
      "Discord channel unknown is not attached to a project",
    );
    expect(() => store.setStatusMessage("unknown", "message-1")).toThrow(
      "Discord channel unknown is not attached to a project",
    );
  });

  it("validates required IDs and project directories", () => {
    const store = new BindingStore();

    expect(() => store.attachProject("", "C:/code/alpha")).toThrow(
      "Discord channel ID must not be empty",
    );
    expect(() => store.attachProject("channel-a", " ")).toThrow(
      "Project directory must not be empty",
    );
    expect(() => store.attachRun("channel-a", " ")).toThrow(
      "Run ID must not be empty",
    );
  });
});
