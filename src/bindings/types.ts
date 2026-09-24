export interface ProjectBinding {
  discordChannelId: string;
  project: {
    directory: string;
  };
  activeRunId?: string;
  statusMessageId?: string;
}
