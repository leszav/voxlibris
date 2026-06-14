export const DEFAULT_CLUB_COVER_URL = "/images/default-club-cover.webp";

export function getClubCoverUrl(coverImage?: string | null): string {
  return coverImage || DEFAULT_CLUB_COVER_URL;
}
