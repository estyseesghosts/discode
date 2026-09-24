import { describe, expect, it, vi } from "vitest";

import { BindingStore } from "../bindings/store.js";
import {
  handleProjectAttach,
  isAbsoluteDirectory,
  type ProjectAttachInteraction,
} from "./interactions.js";

describe("handleProjectAttach", () => {
  it("attaches the invoking channel and replies with success", async () => {
    const store = new BindingStore();
    const interaction = mockInteraction({
      channelId: "channel-a",
      directory: "C:/code/alpha",
    });

    const outcome = await handleProjectAttach(interaction, store);

    expect(outcome).toBe("handled");
    expect(store.get("channel-a")?.project.directory).toBe("C:/code/alpha");
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Attached this channel to `C:/code/alpha`.",
    });
  });

  it("keeps independent channel contexts independent", async () => {
    const store = new BindingStore();
    const first = mockInteraction({
      channelId: "channel-a",
      directory: "C:/code/alpha",
    });
    const second = mockInteraction({
      channelId: "channel-b",
      directory: "C:/code/beta",
    });

    await handleProjectAttach(first, store);
    await handleProjectAttach(second, store);

    expect(store.get("channel-a")?.project.directory).toBe("C:/code/alpha");
    expect(store.get("channel-b")?.project.directory).toBe("C:/code/beta");
  });

  it("replaces the project on re-attach", async () => {
    const store = new BindingStore();
    store.attachProject("channel-a", "C:/code/old");
    store.attachRun("channel-a", "run-old");
    const interaction = mockInteraction({
      channelId: "channel-a",
      directory: "C:/code/new",
    });

    await handleProjectAttach(interaction, store);

    expect(store.get("channel-a")).toEqual({
      discordChannelId: "channel-a",
      project: { directory: "C:/code/new" },
    });
    expect(interaction.reply).toHaveBeenCalledWith({
      content: "Attached this channel to `C:/code/new`.",
    });
  });

  it("replies ephemerally when the channel context is missing", async () => {
    const store = new BindingStore();
    for (const channelId of [undefined, null, "  "]) {
      const interaction = mockInteraction({
        channelId: channelId as string | undefined | null,
        directory: "C:/code/alpha",
      });

      const outcome = await handleProjectAttach(interaction, store);

      expect(outcome).toBe("handled");
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("channel or thread"),
        ephemeral: true,
      });
    }
    expect([...store.all()]).toHaveLength(0);
  });

  it("replies ephemerally when the directory option is missing or blank", async () => {
    const store = new BindingStore();
    for (const directory of [null, "   "]) {
      const interaction = mockInteraction({
        channelId: "channel-a",
        directory,
      });

      await handleProjectAttach(interaction, store);

      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("project directory is required"),
        ephemeral: true,
      });
    }
    expect(store.get("channel-a")).toBeUndefined();
  });

  it("replies ephemerally when the directory is not absolute", async () => {
    const store = new BindingStore();
    for (const directory of [
      "relative/path",
      "./alpha",
      "../alpha",
      "~/code/alpha",
      "C:code\\alpha",
      "\\\\",
    ]) {
      const interaction = mockInteraction({
        channelId: "channel-a",
        directory,
      });

      const outcome = await handleProjectAttach(interaction, store);

      expect(outcome).toBe("handled");
      expect(interaction.reply).toHaveBeenCalledWith({
        content: expect.stringContaining("must be absolute"),
        ephemeral: true,
      });
    }
    expect(store.get("channel-a")).toBeUndefined();
  });

  it("accepts POSIX, Windows drive, and UNC absolute directories", async () => {
    const store = new BindingStore();
    for (const [channelId, directory] of [
      ["channel-posix", "/home/user/project"],
      ["channel-win-slash", "C:/code/alpha"],
      ["channel-win-backslash", "D:\\code\\beta"],
      ["channel-unc", "\\\\server\\share\\project"],
    ] as const) {
      const interaction = mockInteraction({ channelId, directory });

      expect(await handleProjectAttach(interaction, store)).toBe("handled");
      expect(store.get(channelId)?.project.directory).toBe(directory);
      expect(interaction.reply).toHaveBeenCalledWith({
        content: `Attached this channel to \`${directory}\`.`,
      });
    }
  });

  it("replies ephemerally when the store fails, without leaking details", async () => {
    const store = new BindingStore();
    vi.spyOn(store, "attachProject").mockImplementation(() => {
      throw new Error("sqlite disk I/O error at /secret/path");
    });
    const interaction = mockInteraction({
      channelId: "channel-a",
      directory: "C:/code/alpha",
    });

    await handleProjectAttach(interaction, store);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(interaction.reply).mock.calls[0]?.[0];
    expect(payload).toMatchObject({ ephemeral: true });
    expect(payload?.content).toContain("Could not attach");
    expect(payload?.content).not.toContain("sqlite");
    expect(payload?.content).not.toContain("/secret/path");
  });

  it("leaves other commands and subcommands unhandled without replying", async () => {
    const store = new BindingStore();
    const otherCommand = mockInteraction({
      commandName: "run",
      channelId: "channel-a",
      directory: "C:/code/alpha",
    });
    const otherSubcommand = mockInteraction({
      channelId: "channel-a",
      subcommand: "detach",
      directory: "C:/code/alpha",
    });

    expect(await handleProjectAttach(otherCommand, store)).toBe("unhandled");
    expect(await handleProjectAttach(otherSubcommand, store)).toBe(
      "unhandled",
    );
    expect(otherCommand.reply).not.toHaveBeenCalled();
    expect(otherSubcommand.reply).not.toHaveBeenCalled();
    expect([...store.all()]).toHaveLength(0);
  });

  it("treats thread IDs as independent channel contexts", async () => {
    // A Discord thread is just another channel ID from the bot's perspective:
    // the parent channel and its thread must not share a binding.
    const store = new BindingStore();
    const parent = mockInteraction({
      channelId: "123456789012345678",
      directory: "/home/user/parent-project",
    });
    const thread = mockInteraction({
      channelId: "123456789012345679",
      directory: "/home/user/thread-project",
    });

    await handleProjectAttach(parent, store);
    await handleProjectAttach(thread, store);

    expect(store.get("123456789012345678")?.project.directory).toBe(
      "/home/user/parent-project",
    );
    expect(store.get("123456789012345679")?.project.directory).toBe(
      "/home/user/thread-project",
    );
  });

  it("propagates reply failures to the caller", async () => {
    const store = new BindingStore();
    const interaction = mockInteraction({
      channelId: "channel-a",
      directory: "C:/code/alpha",
    });
    vi.mocked(interaction.reply).mockRejectedValue(
      new Error("Unknown interaction"),
    );

    await expect(handleProjectAttach(interaction, store)).rejects.toThrow(
      "Unknown interaction",
    );
  });
});

describe("isAbsoluteDirectory", () => {
  it.each([
    ["/", true],
    ["/home/user/project", true],
    ["C:/code/alpha", true],
    ["C:\\code\\alpha", true],
    ["d:/code", true],
    ["\\\\server\\share\\project", true],
    ["relative/path", false],
    ["./alpha", false],
    ["../alpha", false],
    ["~/code/alpha", false],
    ["C:code\\alpha", false],
    ["C:", false],
    ["\\\\", false],
    ["", false],
    ["/home/user/\0project", false],
  ])("classifies %s as absolute=%s", (value, expected) => {
    expect(isAbsoluteDirectory(value)).toBe(expected);
  });
});

function mockInteraction(input: {
  commandName?: string;
  channelId?: string | null;
  subcommand?: string;
  directory?: string | null;
}): ProjectAttachInteraction & {
  reply: ReturnType<typeof vi.fn>;
} {
  const directory = input.directory === undefined ? "C:/code/alpha" : input.directory;
  const channelId =
    "channelId" in input ? input.channelId : ("channel-a" as const);
  return {
    commandName: input.commandName ?? "project",
    channelId,
    options: {
      getSubcommand: () => input.subcommand ?? "attach",
      getString: (name: string) => {
        if (name !== "directory") {
          return null;
        }
        if (directory === null) {
          throw new Error("Required option missing in mock");
        }
        return directory;
      },
    },
    reply: vi.fn().mockResolvedValue(undefined),
  };
}
