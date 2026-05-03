interface ReaderProgressSnapshot {
  currentChapter: number;
  currentPosition: string;
  progress: number;
}

type ReaderProgressScope =
  | {
      type: "personal";
      bookId: string;
    }
  | {
      type: "club";
      clubId: string;
      bookId: string;
    };

const READER_PROGRESS_STORAGE_PREFIX = "voxlibris:reader-progress";

function getProgressStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function getReaderProgressStorageKey(scope: ReaderProgressScope): string {
  if (scope.type === "personal") {
    return `${READER_PROGRESS_STORAGE_PREFIX}:personal:${scope.bookId}`;
  }

  return `${READER_PROGRESS_STORAGE_PREFIX}:club:${scope.clubId}:${scope.bookId}`;
}

function isReaderProgressSnapshot(value: unknown): value is ReaderProgressSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Partial<ReaderProgressSnapshot>;
  return (
    typeof snapshot.currentChapter === "number" &&
    typeof snapshot.currentPosition === "string" &&
    typeof snapshot.progress === "number"
  );
}

function getReaderPositionTimestamp(currentPosition: string): number | null {
  try {
    const parsed = JSON.parse(currentPosition) as { timestamp?: unknown };
    return typeof parsed.timestamp === "number" ? parsed.timestamp : null;
  } catch {
    return null;
  }
}

function isReaderProgressNewer(
  candidate: ReaderProgressSnapshot,
  baseline: ReaderProgressSnapshot
): boolean {
  const candidateTimestamp = getReaderPositionTimestamp(candidate.currentPosition);
  const baselineTimestamp = getReaderPositionTimestamp(baseline.currentPosition);

  if (candidateTimestamp !== null || baselineTimestamp !== null) {
    if (candidateTimestamp === null) {
      return false;
    }
    if (baselineTimestamp === null) {
      return true;
    }
    if (candidateTimestamp !== baselineTimestamp) {
      return candidateTimestamp > baselineTimestamp;
    }
  }

  if (candidate.currentChapter !== baseline.currentChapter) {
    return candidate.currentChapter > baseline.currentChapter;
  }

  if (candidate.progress !== baseline.progress) {
    return candidate.progress > baseline.progress;
  }

  return candidate.currentPosition !== baseline.currentPosition;
}

export function loadReaderProgressFromStorage(scope: ReaderProgressScope): ReaderProgressSnapshot | null {
  const storage = getProgressStorage();
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(getReaderProgressStorageKey(scope));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isReaderProgressSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveReaderProgressToStorage(
  scope: ReaderProgressScope,
  progress: ReaderProgressSnapshot
): void {
  const storage = getProgressStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(getReaderProgressStorageKey(scope), JSON.stringify(progress));
  } catch {
    // Ignore storage quota and privacy mode failures.
  }
}

export function getFreshestReaderProgress(
  remoteProgress: ReaderProgressSnapshot | null | undefined,
  localProgress: ReaderProgressSnapshot | null | undefined
): ReaderProgressSnapshot | null {
  if (!remoteProgress) {
    return localProgress ?? null;
  }

  if (!localProgress) {
    return remoteProgress;
  }

  return isReaderProgressNewer(localProgress, remoteProgress) ? localProgress : remoteProgress;
}