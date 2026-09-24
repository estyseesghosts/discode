import type { ProjectBinding } from "./types.js";

export class BindingStore {
  private readonly bindings = new Map<string, ProjectBinding>();

  get(channelId: string): ProjectBinding | undefined {
    const binding = this.bindings.get(channelId);
    return binding === undefined ? undefined : copyBinding(binding);
  }

  attachProject(channelId: string, directory: string): ProjectBinding {
    requireText(channelId, "Discord channel ID");
    requireText(directory, "Project directory");

    const binding: ProjectBinding = {
      discordChannelId: channelId,
      project: { directory },
    };

    this.bindings.set(channelId, binding);
    return copyBinding(binding);
  }

  attachRun(channelId: string, runId: string): ProjectBinding {
    requireText(runId, "Run ID");

    const binding = this.require(channelId);
    binding.activeRunId = runId;
    return copyBinding(binding);
  }

  detachRun(channelId: string): void {
    const binding = this.require(channelId);
    delete binding.activeRunId;
  }

  detachProject(channelId: string): void {
    this.bindings.delete(channelId);
  }

  setStatusMessage(channelId: string, messageId: string): void {
    requireText(messageId, "Status message ID");
    this.require(channelId).statusMessageId = messageId;
  }

  all(): Iterable<ProjectBinding> {
    return [...this.bindings.values()].map(copyBinding);
  }

  private require(channelId: string): ProjectBinding {
    const binding = this.bindings.get(channelId);

    if (binding === undefined) {
      throw new Error(
        `Discord channel ${channelId} is not attached to a project`,
      );
    }

    return binding;
  }
}

function copyBinding(binding: ProjectBinding): ProjectBinding {
  return {
    ...binding,
    project: { ...binding.project },
  };
}

function requireText(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty`);
  }
}
