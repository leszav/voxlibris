export interface ReaderPositionPayload {
  chapter?: number;
  scrollTop: number;
  scrollHeight?: number;
  clientHeight?: number;
  timestamp?: number;
  textOffset?: number;
}

export interface ReaderProgressPayload {
  currentChapter: number;
  currentPosition: string;
  progress: number;
}

export interface ReaderProgressSnapshot {
  currentChapter: number;
  currentPosition: string;
  progress: number;
}

export interface ReaderProgressBuildInput {
  currentChapter: number;
  totalChapters: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  progressOverride?: number;
  timestamp?: number;
  textOffset?: number;
}

export function serializeReaderPosition(position: ReaderPositionPayload): string {
  return JSON.stringify(position);
}

export function parseReaderPosition(raw: string | null | undefined): ReaderPositionPayload | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ReaderPositionPayload>;
    if (typeof parsed !== "object" || parsed === null) return null;
    if (typeof parsed.scrollTop !== "number") return null;

    return {
      chapter: typeof parsed.chapter === "number" ? parsed.chapter : undefined,
      scrollTop: parsed.scrollTop,
      scrollHeight: typeof parsed.scrollHeight === "number" ? parsed.scrollHeight : undefined,
      clientHeight: typeof parsed.clientHeight === "number" ? parsed.clientHeight : undefined,
      timestamp: typeof parsed.timestamp === "number" ? parsed.timestamp : undefined,
      textOffset: typeof parsed.textOffset === "number" ? parsed.textOffset : undefined,
    };
  } catch {
    return null;
  }
}

export function canRestorePositionForChapter(
  position: ReaderPositionPayload,
  currentChapter: number
): boolean {
  if (typeof position.chapter !== "number") {
    return true;
  }
  return position.chapter === currentChapter;
}

export function calculateReadingProgress(
  currentChapter: number,
  totalChapters: number,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number
): number {
  const safeTotalChapters = Math.max(1, totalChapters);
  const maxScrollable = Math.max(1, scrollHeight - clientHeight);
  const scrollProgress = Math.min(100, Math.round((scrollTop / maxScrollable) * 100));

  let totalProgress = Math.round(
    ((currentChapter - 1) / safeTotalChapters + scrollProgress / 100 / safeTotalChapters) * 100
  );

  if (currentChapter === safeTotalChapters) {
    // scrollHeight=0 означает что DOM ещё не отрисован — в этом случае нельзя считать прогресс 100%
    const fitsWithoutScroll = scrollHeight > 0 && scrollHeight <= clientHeight + 1;
    if (fitsWithoutScroll || scrollProgress >= 98) {
      totalProgress = 100;
    }
  }

  return Math.max(0, Math.min(100, totalProgress));
}

export function createReaderProgressPayload(input: ReaderProgressBuildInput): ReaderProgressPayload {
  const {
    currentChapter,
    totalChapters,
    scrollTop,
    scrollHeight,
    clientHeight,
    progressOverride,
    timestamp = Date.now(),
    textOffset,
  } = input;

  const progress = typeof progressOverride === "number"
    ? Math.max(0, Math.min(100, progressOverride))
    : calculateReadingProgress(currentChapter, totalChapters, scrollTop, scrollHeight, clientHeight);

  return {
    currentChapter,
    currentPosition: serializeReaderPosition({
      chapter: currentChapter,
      scrollTop,
      scrollHeight,
      clientHeight,
      timestamp,
      textOffset,
    }),
    progress,
  };
}

export function getReaderProgressSignature(progress: ReaderProgressSnapshot): string {
  return [
    progress.currentChapter,
    progress.progress,
    progress.currentPosition,
  ].join("|");
}
