#!/usr/bin/env tsx

import process from 'node:process';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';

type SingleReaderArgs = {
  baseUrl: string;
  clubId: string;
  bookId: string;
  title: string;
  file: string;
  name: string;
  email?: string;
  username?: string;
  password?: string;
  accessToken?: string;
  chapter: number;
  currentPosition?: string;
  rememberMe: boolean;
};

type ReaderConfig = Omit<SingleReaderArgs, 'baseUrl' | 'clubId' | 'bookId' | 'rememberMe'> & {
  baseUrl?: string;
  clubId?: string;
  bookId?: string;
  rememberMe?: boolean;
};

type MultiReaderFile = {
  baseUrl?: string;
  clubId?: string;
  bookId?: string;
  rememberMe?: boolean;
  readers: ReaderConfig[];
};

type Args =
  | { mode: 'single'; reader: SingleReaderArgs }
  | {
    mode: 'multi';
    baseUrl: string;
    clubId: string;
    bookId: string;
    rememberMe: boolean;
    readers: SingleReaderArgs[];
  };

type AuthState = {
  accessToken: string;
  refreshToken?: string;
};

type LiveReaderSocket = {
  socket: Socket;
  heartbeatTimer: NodeJS.Timeout;
};

type ReaderMetrics = {
  name: string;
  file: string;
  sessionId?: string;
  success: boolean;
  loginMs: number;
  createMs: number;
  startMs: number;
  streamMs: number;
  endMs: number;
  totalMs: number;
  error?: string;
};

type LoginResponse = {
  message: string;
  user?: {
    id: string;
    username: string;
    email: string;
  };
};

type SessionResponse = {
  message: string;
  session: {
    id: string;
    readerId: string;
    clubId: string;
    bookId: string;
    title: string;
  };
};

function getArgs(name: string): string[] {
  const prefix = `--${name}=`;
  const values: string[] = [];

  for (let index = 0; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (!arg) continue;

    if (arg.startsWith(prefix)) {
      values.push(arg.slice(prefix.length));
      continue;
    }

    if (arg === `--${name}`) {
      const next = process.argv[index + 1];
      if (next) {
        values.push(next);
      }
    }
  }

  return values;
}

function getArg(name: string): string | undefined {
  return getArgs(name)[0];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function required(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing required argument: ${label}`);
  }
  return value;
}

function parsePositiveInt(value: string | undefined, label: string, fallback?: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`${label} must be a positive integer`);
}

function validateReaderAuth(args: {
  accessToken?: string;
  password?: string;
  email?: string;
  username?: string;
}): void {
  if (!args.accessToken && !args.password) {
    throw new Error('Provide either --access-token or --password');
  }

  if (!args.accessToken && !args.email && !args.username) {
    throw new Error('Provide --email or --username when using --password');
  }
}

function buildSingleReaderArgs(): SingleReaderArgs {
  const baseUrl = getArg('base-url') ?? 'http://localhost:5000';
  const clubId = required(getArg('club-id'), 'club-id');
  const bookId = required(getArg('book-id'), 'book-id');
  const file = required(getArg('file'), 'file');
  const title = getArg('title') ?? path.basename(file, path.extname(file));
  const name = getArg('name') ?? title;
  const email = getArg('email');
  const username = getArg('username');
  const password = getArg('password');
  const accessToken = getArg('access-token');
  const chapter = parsePositiveInt(getArg('chapter'), 'chapter', 1);
  const currentPosition = getArg('current-position');
  const rememberMe = hasFlag('remember-me');

  validateReaderAuth({ accessToken, password, email, username });

  return {
    baseUrl,
    clubId,
    bookId,
    title,
    file,
    name,
    email,
    username,
    password,
    accessToken,
    chapter,
    currentPosition,
    rememberMe,
  };
}

function readMultiReaderArgs(filePathArg: string): Args {
  const resolvedPath = path.resolve(filePathArg);
  ensureFileExists(resolvedPath);

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const parsed = JSON.parse(raw) as MultiReaderFile;

  const baseUrl = normalizeBaseUrl(parsed.baseUrl ?? getArg('base-url') ?? 'http://localhost:5000');
  const clubId = parsed.clubId ?? getArg('club-id');
  const bookId = parsed.bookId ?? getArg('book-id');
  const rememberMe = parsed.rememberMe ?? hasFlag('remember-me');

  if (!clubId) {
    throw new Error('Missing clubId in readers file or --club-id');
  }

  if (!bookId) {
    throw new Error('Missing bookId in readers file or --book-id');
  }

  if (!Array.isArray(parsed.readers) || parsed.readers.length === 0) {
    throw new Error('readers file must contain a non-empty readers array');
  }

  if (parsed.readers.length > 5) {
    throw new Error('readers file supports up to 5 concurrent readers');
  }

  const readers = parsed.readers.map((reader, index) => {
    const file = required(reader.file, `readers[${index}].file`);
    const title = reader.title ?? path.basename(file, path.extname(file));
    const name = reader.name ?? reader.email ?? reader.username ?? `reader-${index + 1}`;
    const chapter = reader.chapter ?? 1;

    if (!Number.isFinite(chapter) || chapter < 1) {
      throw new Error(`readers[${index}].chapter must be a positive integer`);
    }

    validateReaderAuth(reader);

    return {
      baseUrl: normalizeBaseUrl(reader.baseUrl ?? baseUrl),
      clubId: reader.clubId ?? clubId,
      bookId: reader.bookId ?? bookId,
      title,
      file,
      name,
      email: reader.email,
      username: reader.username,
      password: reader.password,
      accessToken: reader.accessToken,
      chapter,
      currentPosition: reader.currentPosition,
      rememberMe: reader.rememberMe ?? rememberMe,
    };
  });

  return {
    mode: 'multi',
    baseUrl,
    clubId,
    bookId,
    rememberMe,
    readers,
  };
}

function parseArgs(): Args {
  const readersFile = getArg('readers-file');
  if (readersFile) {
    return readMultiReaderArgs(readersFile);
  }

  return {
    mode: 'single',
    reader: buildSingleReaderArgs(),
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSetCookieValues(headers: Headers): string[] {
  const candidate = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof candidate.getSetCookie === 'function') {
    return candidate.getSetCookie();
  }

  const combined = headers.get('set-cookie');
  if (!combined) {
    return [];
  }

  return combined.split(/,(?=[^;]+=[^;]+)/g);
}

function getCookie(headers: Headers, name: string): string | null {
  const pattern = new RegExp(`(?:^|;)\\s*${escapeRegExp(name)}=([^;]+)`);
  for (const raw of getSetCookieValues(headers)) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function login(baseUrl: string, args: SingleReaderArgs): Promise<AuthState> {
  if (args.accessToken) {
    return { accessToken: args.accessToken };
  }

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      email: args.email,
      username: args.username,
      password: args.password,
      rememberMe: args.rememberMe,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed (${response.status}): ${text}`);
  }

  const body = (await response.json()) as LoginResponse;
  const accessToken = getCookie(response.headers, 'accessToken');
  if (!accessToken) {
    throw new Error(`Login succeeded but accessToken cookie is missing. Response: ${body.message}`);
  }

  return {
    accessToken,
    refreshToken: getCookie(response.headers, 'refreshToken') ?? undefined,
  };
}

async function jsonRequest<T>(
  url: string,
  auth: AuthState,
  options: RequestInit = {},
): Promise<T> {
  const makeRequest = async (): Promise<Response> => fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${auth.accessToken}`,
      ...(options.headers ?? {}),
    },
  });

  let response = await makeRequest();
  if (response.status === 401 && auth.refreshToken) {
    auth.accessToken = await refreshAccessToken(url, auth);
    response = await makeRequest();
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed (${response.status}) ${url}: ${text}`);
  }

  return response.json() as Promise<T>;
}

async function refreshAccessToken(baseUrlOrUrl: string, auth: AuthState): Promise<string> {
  const baseUrl = new URL(baseUrlOrUrl).origin;
  const response = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Cookie: `refreshToken=${auth.refreshToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }

  const accessToken = getCookie(response.headers, 'accessToken');
  if (!accessToken) {
    throw new Error('Token refresh succeeded but accessToken cookie is missing');
  }

  auth.refreshToken = getCookie(response.headers, 'refreshToken') ?? auth.refreshToken;
  return accessToken;
}

async function createSession(baseUrl: string, auth: AuthState, args: SingleReaderArgs): Promise<string> {
  const data = await jsonRequest<SessionResponse>(`${baseUrl}/api/sessions`, auth, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clubId: args.clubId,
      bookId: args.bookId,
      title: args.title,
      currentChapter: args.chapter,
      currentPosition: args.currentPosition,
    }),
  });

  return data.session.id;
}

async function startSession(baseUrl: string, auth: AuthState, sessionId: string): Promise<void> {
  await jsonRequest(`${baseUrl}/api/sessions/${sessionId}/start`, auth, {
    method: 'PUT',
  });
}

async function endSession(baseUrl: string, auth: AuthState, sessionId: string): Promise<void> {
  await jsonRequest(`${baseUrl}/api/sessions/${sessionId}/end`, auth, {
    method: 'PUT',
  });
}

function ensureFileExists(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }
}

function spawnOggTranscoder(filePath: string) {
  const ffmpeg = spawn('ffmpeg', [
    '-v', 'error',
    '-re',
    '-i', filePath,
    '-vn',
    '-map', '0:a:0',
    '-c:a', 'libopus',
    '-b:a', '64k',
    '-ar', '48000',
    '-f', 'ogg',
    'pipe:1',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  ffmpeg.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString().trim();
    if (text) {
      console.warn(`[sim:ffmpeg] ${text}`);
    }
  });

  return ffmpeg;
}

async function streamAudio(baseUrl: string, accessToken: string, sessionId: string, filePath: string): Promise<void> {
  const ffmpeg = spawnOggTranscoder(filePath);
  const body = Readable.toWeb(ffmpeg.stdout) as ReadableStream<Uint8Array>;

  try {
    const response = await fetch(`${baseUrl}/api/studio/stream/${sessionId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'audio/ogg;codecs=opus',
      },
      // @ts-expect-error Node fetch supports streaming request bodies via duplex
      duplex: 'half',
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Studio ingest failed (${response.status}): ${text}`);
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;

      ffmpeg.on('error', (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });

      ffmpeg.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`ffmpeg exited with code ${code ?? 'null'}`));
      });
    });
  } finally {
    if (!ffmpeg.killed) {
      ffmpeg.kill('SIGTERM');
    }
  }
}

function getSocketOrigin(baseUrl: string): string {
  const url = new URL(baseUrl);
  return `${url.protocol}//${url.host}`;
}

async function connectLiveReaderSocket(
  baseUrl: string,
  auth: AuthState,
  reader: SingleReaderArgs,
  sessionId: string,
): Promise<LiveReaderSocket> {
  const socket = io(getSocketOrigin(baseUrl), {
    path: '/ws/reader',
    transports: ['websocket'],
    withCredentials: true,
    auth: {
      token: auth.accessToken,
    },
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const handleConnect = () => {
      if (settled) return;
      settled = true;
      socket.off('connect_error', handleError);
      socket.off('error', handleSocketError);
      resolve();
    };

    const handleError = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.off('connect', handleConnect);
      socket.off('error', handleSocketError);
      reject(error);
    };

    const handleSocketError = (error: unknown) => {
      if (settled) return;
      settled = true;
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleError);
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    socket.once('connect', handleConnect);
    socket.once('connect_error', handleError);
    socket.once('error', handleSocketError);
  });

  socket.emit('join_club', { clubId: reader.clubId });
  socket.emit('join_book', { bookId: reader.bookId, clubId: reader.clubId });
  socket.emit('live_reader:start', {
    clubId: reader.clubId,
    bookId: reader.bookId,
    sessionId,
    chapter: reader.chapter,
    readerName: reader.name,
  });

  const heartbeatTimer = setInterval(() => {
    socket.emit('live_reader:heartbeat', { sessionId });
  }, 30000);

  return {
    socket,
    heartbeatTimer,
  };
}

function stopLiveReaderSocket(liveSocket: LiveReaderSocket | null, reader: SingleReaderArgs, sessionId?: string): void {
  if (!liveSocket) {
    return;
  }

  clearInterval(liveSocket.heartbeatTimer);

  if (sessionId) {
    liveSocket.socket.emit('live_reader:stop', {
      clubId: reader.clubId,
      bookId: reader.bookId,
      sessionId,
    });
    liveSocket.socket.emit('leave_book', {
      bookId: reader.bookId,
      clubId: reader.clubId,
    });
  }

  liveSocket.socket.disconnect();
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

function printSummary(metrics: ReaderMetrics[], wallClockMs: number): void {
  const ok = metrics.filter((item) => item.success).length;
  const failed = metrics.length - ok;
  const totalStreamMs = metrics.reduce((sum, item) => sum + item.streamMs, 0);
  const totalDurationMs = metrics.reduce((sum, item) => sum + item.totalMs, 0);
  const maxDurationMs = metrics.reduce((max, item) => Math.max(max, item.totalMs), 0);

  console.log('\n[sim] summary');
  console.log(
    'reader'.padEnd(20) +
    'result'.padEnd(10) +
    'login'.padStart(12) +
    'create'.padStart(12) +
    'start'.padStart(12) +
    'stream'.padStart(12) +
    'end'.padStart(12) +
    'total'.padStart(12),
  );
  console.log('-'.repeat(102));

  for (const item of metrics) {
    console.log(
      item.name.slice(0, 19).padEnd(20) +
      (item.success ? 'ok' : 'failed').padEnd(10) +
      formatMs(item.loginMs).padStart(12) +
      formatMs(item.createMs).padStart(12) +
      formatMs(item.startMs).padStart(12) +
      formatMs(item.streamMs).padStart(12) +
      formatMs(item.endMs).padStart(12) +
      formatMs(item.totalMs).padStart(12),
    );

    if (item.error) {
      console.log(`  error: ${item.error}`);
    }
    if (item.sessionId) {
      console.log(`  sessionId: ${item.sessionId}`);
    }
  }

  console.log(
    `\n[sim] aggregate readers=${metrics.length} ok=${ok} failed=${failed} wall=${formatMs(wallClockMs)} total=${formatMs(totalDurationMs)} stream-sum=${formatMs(totalStreamMs)} max-reader=${formatMs(maxDurationMs)}`,
  );
}

async function runReader(reader: SingleReaderArgs): Promise<ReaderMetrics> {
  const baseUrl = normalizeBaseUrl(reader.baseUrl);
  const filePath = path.resolve(reader.file);
  ensureFileExists(filePath);

  const metrics: ReaderMetrics = {
    name: reader.name,
    file: filePath,
    success: false,
    loginMs: 0,
    createMs: 0,
    startMs: 0,
    streamMs: 0,
    endMs: 0,
    totalMs: 0,
  };

  const totalStartedAt = performance.now();
  let auth: AuthState | null = null;
  let liveSocket: LiveReaderSocket | null = null;

  try {
    console.log(`[sim:${reader.name}] baseUrl=${baseUrl}`);
    console.log(`[sim:${reader.name}] file=${filePath}`);

    const loginStartedAt = performance.now();
    auth = await login(baseUrl, reader);
    metrics.loginMs = performance.now() - loginStartedAt;
    console.log(`[sim:${reader.name}] authenticated`);

    const createStartedAt = performance.now();
    const sessionId = await createSession(baseUrl, auth, reader);
    metrics.createMs = performance.now() - createStartedAt;
    metrics.sessionId = sessionId;
    console.log(`[sim:${reader.name}] session created: ${sessionId}`);

    const startStartedAt = performance.now();
    await startSession(baseUrl, auth, sessionId);
    metrics.startMs = performance.now() - startStartedAt;
    console.log(`[sim:${reader.name}] session started: ${sessionId}`);

    liveSocket = await connectLiveReaderSocket(baseUrl, auth, reader, sessionId);
    console.log(`[sim:${reader.name}] live reader announced: ${sessionId}`);

    const streamStartedAt = performance.now();
    await streamAudio(baseUrl, auth.accessToken, sessionId, filePath);
    metrics.streamMs = performance.now() - streamStartedAt;
    console.log(`[sim:${reader.name}] audio streamed successfully: ${sessionId}`);
    metrics.success = true;

    const endStartedAt = performance.now();
    await endSession(baseUrl, auth, sessionId);
    metrics.endMs = performance.now() - endStartedAt;
    console.log(`[sim:${reader.name}] session ended: ${sessionId}`);
    stopLiveReaderSocket(liveSocket, reader, sessionId);
    liveSocket = null;
  } catch (error) {
    metrics.error = error instanceof Error ? error.message : String(error);

    if (auth && metrics.sessionId) {
      const endStartedAt = performance.now();
      try {
        await endSession(baseUrl, auth, metrics.sessionId);
        metrics.endMs = performance.now() - endStartedAt;
        console.log(`[sim:${reader.name}] session ended after failure: ${metrics.sessionId}`);
      } catch (endError) {
        const endMessage = endError instanceof Error ? endError.message : String(endError);
        metrics.error = `${metrics.error}; end failed: ${endMessage}`;
        console.warn(`[sim:${reader.name}] failed to end session cleanly: ${endMessage}`);
      }
    }
  } finally {
    stopLiveReaderSocket(liveSocket, reader, metrics.sessionId);
    metrics.totalMs = performance.now() - totalStartedAt;
  }

  return metrics;
}

function printUsage(): void {
  console.log(`
Studio simulator

Required:
  --club-id <uuid>
  --book-id <uuid>
  --file <path>

Or:
  --readers-file <path-to-json>

Auth:
  Either:
    --access-token <jwt>
  Or:
    --email <email> | --username <name>
    --password <password>

Optional:
  --base-url <url>           default: http://localhost:5000
  --name <label>             default: title/email/username
  --title <session title>    default: audio filename
  --chapter <number>         default: 1
  --current-position <json>
  --remember-me

readers-file JSON format:
  {
    "baseUrl": "http://localhost:5000",
    "clubId": "...",
    "bookId": "...",
    "rememberMe": true,
    "readers": [
      {
        "name": "reader-1",
        "email": "user1@example.com",
        "password": "***",
        "file": ".tmp/studio-sim/reader-a-3min.mp3"
      }
    ]
  }

Example:
  pnpm tsx script/studio-sim.ts \
    --email admin@example.com \
    --password '***' \
    --club-id <clubId> \
    --book-id <bookId> \
    --file .tmp/studio-sim/reader-a-3min.mp3
`);
}

async function main(): Promise<void> {
  if (hasFlag('help')) {
    printUsage();
    return;
  }

  const args = parseArgs();
  const startedAt = performance.now();

  const metrics = args.mode === 'single'
    ? [await runReader(args.reader)]
    : await Promise.all(args.readers.map((reader) => runReader(reader)));

  printSummary(metrics, performance.now() - startedAt);

  if (metrics.some((item) => !item.success)) {
    process.exit(1);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[sim] failed: ${message}`);
  process.exit(1);
});
