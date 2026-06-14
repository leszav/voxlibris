import { storage } from '../repositories/index.js';
import type { Club, ClubMember } from '../../shared/schema.js';

export function isReaderLedClub(club: Pick<Club, 'type'>): boolean {
  return club.type === 'reader-led';
}

export function isReaderOwner(
  club: Pick<Club, 'ownerId' | 'type'>,
  membership: Pick<ClubMember, 'userId' | 'role' | 'isActive'> | null | undefined,
  userId: string,
): boolean {
  return isReaderLedClub(club) && club.ownerId === userId && membership?.role === 'owner' && membership.isActive;
}

export function isActiveReaderClubListener(
  club: Pick<Club, 'ownerId' | 'type'>,
  membership: Pick<ClubMember, 'userId' | 'role' | 'isActive'> | null | undefined,
  userId: string,
): boolean {
  return isReaderLedClub(club) && club.ownerId !== userId && membership?.role === 'member' && membership.isActive;
}

export function canCreateReaderLedClub(userRole: string | null | undefined): boolean {
  return userRole === 'admin' || userRole === 'moderator';
}

export async function canCreateReaderLedClubForUser(userId: string, userRole: string | null | undefined): Promise<boolean> {
  if (canCreateReaderLedClub(userRole)) {
    return true;
  }

  const profile = await storage.getUserProfile(userId).catch(() => undefined);
  if (!profile?.readerSettings) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(profile.readerSettings);
    return typeof parsed === 'object'
      && parsed !== null
      && (parsed as { canCreateReaderLedClubs?: unknown }).canCreateReaderLedClubs === true;
  } catch {
    return false;
  }
}
