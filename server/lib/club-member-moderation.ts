import type { ClubMember } from '../../shared/schema.js';

function isFutureDate(value: Date | string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  return new Date(value).getTime() > now.getTime();
}

export function isClubMemberMuted(member: Pick<ClubMember, 'mutedUntil'>, now?: Date): boolean {
  return isFutureDate(member.mutedUntil, now);
}

export function isClubMemberDeactivated(member: Pick<ClubMember, 'isActive' | 'deactivatedUntil'>, now?: Date): boolean {
  return member.isActive === false && !member.deactivatedUntil || isFutureDate(member.deactivatedUntil, now);
}

export function canClubMemberWrite(member: Pick<ClubMember, 'isActive' | 'mutedUntil' | 'deactivatedUntil'>, now?: Date): boolean {
  return !isClubMemberMuted(member, now) && !isClubMemberDeactivated(member, now);
}
