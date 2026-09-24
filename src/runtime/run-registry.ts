/**
 * In-memory run registry for OpenCode root sessions.
 *
 * Tracks explicitly registered root runs keyed by root session ID and
 * project directory, separate from Discord channel bindings. Child sessions
 * are indexed under a known root only via {@link RunRegistry.indexChildSession};
 * unknown sessions are never auto-discovered here — that decision belongs to
 * the event-ingestion layer (`run-state.ts`).
 *
 * No Discord or BindingStore imports: this module knows nothing about
 * channels.
 */

/** Minimal semantic state for a root run. */
export type RunState = "idle" | "working" | "error";

/** A root OpenCode run with its indexed child sessions. */
export interface Run {
  readonly rootSessionId: string;
  readonly projectDirectory: string;
  readonly state: RunState;
  readonly childSessionIds: readonly string[];
}

/** Input for {@link RunRegistry.registerRoot}. */
export interface RegisterRootInput {
  readonly rootSessionId: string;
  readonly projectDirectory: string;
}

interface InternalRun {
  readonly rootSessionId: string;
  readonly projectDirectory: string;
  state: RunState;
  childSessionIds: Set<string>;
}

const VALID_STATES: readonly RunState[] = ["idle", "working", "error"];

/**
 * In-memory index of known root runs.
 *
 * Maintains three indexes:
 * - roots: root session ID -> internal run record;
 * - sessionToRoot: every known session ID (root or indexed child) -> root ID;
 * - directoryToRoots: project directory -> set of root IDs.
 */
export class RunRegistry {
  private readonly roots = new Map<string, InternalRun>();
  private readonly sessionToRoot = new Map<string, string>();
  private readonly directoryToRoots = new Map<string, Set<string>>();

  /**
   * Register a root session idempotently.
   *
   * A registered root run's `projectDirectory` is immutable: re-registering
   * the same root ID with the same directory is a no-op that preserves the
   * current state and indexed children, while re-registering the same root
   * ID with a different directory throws a conflict error.
   */
  registerRoot(input: RegisterRootInput): Run {
    const rootSessionId = requireId(input?.rootSessionId, "Root session ID");
    const projectDirectory = requireId(
      input?.projectDirectory,
      "Project directory",
    );

    const existing = this.roots.get(rootSessionId);
    if (existing) {
      if (existing.projectDirectory !== projectDirectory) {
        throw new Error(
          `Root session "${rootSessionId}" is already registered with project directory "${existing.projectDirectory}"`,
        );
      }
      return copyRun(existing);
    }

    // A session ID already known as a child cannot become a root silently;
    // that would orphan the previous parent mapping.
    const owner = this.sessionToRoot.get(rootSessionId);
    if (owner !== undefined && owner !== rootSessionId) {
      throw new Error(
        `Session "${rootSessionId}" is already indexed as a child of root "${owner}"`,
      );
    }

    const record: InternalRun = {
      rootSessionId,
      projectDirectory,
      state: "idle",
      childSessionIds: new Set<string>(),
    };
    this.roots.set(rootSessionId, record);
    this.sessionToRoot.set(rootSessionId, rootSessionId);
    this.addToDirectoryIndex(projectDirectory, rootSessionId);
    return copyRun(record);
  }

  /** Resolve any known session (root or indexed child) to its root run. */
  runForSession(sessionId: string): Run | undefined {
    if (typeof sessionId !== "string") {
      return undefined;
    }
    const trimmed = sessionId.trim();
    if (!trimmed) {
      return undefined;
    }
    const rootId = this.sessionToRoot.get(trimmed);
    if (rootId === undefined) {
      return undefined;
    }
    const record = this.roots.get(rootId);
    return record === undefined ? undefined : copyRun(record);
  }

  /** Fetch a root run by its root session ID only (not by child ID). */
  get(rootSessionId: string): Run | undefined {
    if (typeof rootSessionId !== "string") {
      return undefined;
    }
    const trimmed = rootSessionId.trim();
    if (!trimmed) {
      return undefined;
    }
    const record = this.roots.get(trimmed);
    return record === undefined ? undefined : copyRun(record);
  }

  /**
   * Index a child session under an explicitly registered root.
   *
   * Idempotent for repeat calls with the same pair. Throws when the root is
   * unknown, when either ID is blank, when the child is itself a registered
   * root, or when the child is already indexed under a different root.
   */
  indexChildSession(rootSessionId: string, sessionId: string): Run {
    const rootId = requireId(rootSessionId, "Root session ID");
    const childId = requireId(sessionId, "Child session ID");

    const record = this.roots.get(rootId);
    if (record === undefined) {
      throw new Error(`Unknown root session "${rootId}"`);
    }
    if (childId === rootId) {
      return copyRun(record);
    }
    if (this.roots.has(childId)) {
      throw new Error(
        `Session "${childId}" is already registered as a root session`,
      );
    }
    const owner = this.sessionToRoot.get(childId);
    if (owner !== undefined && owner !== rootId) {
      throw new Error(
        `Session "${childId}" is already indexed under root "${owner}"`,
      );
    }
    if (owner === rootId) {
      return copyRun(record);
    }

    record.childSessionIds.add(childId);
    this.sessionToRoot.set(childId, rootId);
    return copyRun(record);
  }

  /** List defensive copies of every root run in a directory. */
  runsInDirectory(directory: string): Run[] {
    if (typeof directory !== "string") {
      return [];
    }
    const trimmed = directory.trim();
    if (!trimmed) {
      return [];
    }
    const rootIds = this.directoryToRoots.get(trimmed);
    if (rootIds === undefined) {
      return [];
    }
    const runs: Run[] = [];
    for (const rootId of rootIds) {
      const record = this.roots.get(rootId);
      if (record !== undefined) {
        runs.push(copyRun(record));
      }
    }
    return runs;
  }

  /** Transition a known root to a new state. */
  setState(rootSessionId: string, state: RunState): Run {
    const rootId = requireId(rootSessionId, "Root session ID");
    requireState(state);
    const record = this.roots.get(rootId);
    if (record === undefined) {
      throw new Error(`Unknown root session "${rootId}"`);
    }
    record.state = state;
    return copyRun(record);
  }

  /**
   * Remove a root run and drop its child indexes.
   *
   * Silent when the root is unknown. Never removes other roots, even ones
   * sharing the same directory.
   */
  remove(rootSessionId: string): void {
    if (typeof rootSessionId !== "string") {
      return;
    }
    const trimmed = rootSessionId.trim();
    if (!trimmed) {
      return;
    }
    const record = this.roots.get(trimmed);
    if (record === undefined) {
      return;
    }
    this.roots.delete(trimmed);
    this.sessionToRoot.delete(trimmed);
    for (const childId of record.childSessionIds) {
      this.sessionToRoot.delete(childId);
    }
    this.removeFromDirectoryIndex(record.projectDirectory, trimmed);
  }

  /** List defensive copies of every registered root run. */
  all(): Run[] {
    return [...this.roots.values()].map(copyRun);
  }

  private addToDirectoryIndex(directory: string, rootId: string): void {
    let bucket = this.directoryToRoots.get(directory);
    if (bucket === undefined) {
      bucket = new Set<string>();
      this.directoryToRoots.set(directory, bucket);
    }
    bucket.add(rootId);
  }

  private removeFromDirectoryIndex(directory: string, rootId: string): void {
    const bucket = this.directoryToRoots.get(directory);
    if (bucket === undefined) {
      return;
    }
    bucket.delete(rootId);
    if (bucket.size === 0) {
      this.directoryToRoots.delete(directory);
    }
  }
}

function copyRun(record: InternalRun): Run {
  return {
    rootSessionId: record.rootSessionId,
    projectDirectory: record.projectDirectory,
    state: record.state,
    childSessionIds: [...record.childSessionIds],
  };
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must not be empty`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must not be empty`);
  }
  return trimmed;
}

function requireState(state: unknown): asserts state is RunState {
  if (
    state !== "idle" &&
    state !== "working" &&
    state !== "error"
  ) {
    throw new Error(`Run state must be one of ${(VALID_STATES as readonly string[]).join(", ")}`);
  }
}
