const DEFAULT_ICECAST_PUBLIC_URL = 'https://radio.voxlibris.ru';

function normalizeBaseUrl(rawBaseUrl: string): string {
  return rawBaseUrl.replace(/\/+$/, '');
}

export function getIcecastPublicBaseUrl(): string {
  return normalizeBaseUrl(process.env.ICECAST_PUBLIC_URL || DEFAULT_ICECAST_PUBLIC_URL);
}

export function getIcecastStreamUrl(sessionId: string): string {
  return `${getIcecastPublicBaseUrl()}/live/${sessionId}.mp3`;
}
