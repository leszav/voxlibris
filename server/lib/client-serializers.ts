import type { ClubBook, ClubMemberRole, ClubWithDetails, User } from "../../shared/schema.js";

type AuthUserInput = Pick<
  User,
  "id" | "username" | "email" | "role" | "status" | "emailConfirmed" | "createdAt" | "lastActivityAt"
>;

export interface ClientClubOwner {
  id: string;
  username: string;
}

export interface ClientClubMember {
  id: string;
  username: string;
  role: ClubMemberRole;
  joinedAt: Date;
}

export interface ClientPublicCatalogClub {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  bookTitle: string | null;
  author: string | null;
  bookCoverUrl: string | null;
  type: string;
  isPrivate: boolean;
  isLive: boolean;
  memberCount: number;
  maxMembers: number;
  tags: string[];
}

export type ClientAuthUser = {
  id: string;
  username: string;
  email: string;
  role: User["role"];
  status: User["status"];
  emailConfirmed: boolean;
  createdAt: Date;
  lastActivityAt: Date | null;
};

export type ClientClubBook = Omit<ClubBook, "fileHash" | "storagePath" | "encryptedContentKey">;
export type ClientClub = Omit<ClubWithDetails, "owner" | "book" | "books"> & {
  owner: ClientClubOwner | null;
  book: ClientClubBook | null;
  books?: ClientClubBook[];
  viewerMembershipRole?: ClubMemberRole | null;
};

export function serializeAuthUser(user: AuthUserInput): ClientAuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    emailConfirmed: user.emailConfirmed,
    createdAt: user.createdAt,
    lastActivityAt: user.lastActivityAt ?? null,
  };
}

export function serializeClubOwner(owner: ClientClubOwner | null | undefined): ClientClubOwner | null {
  if (!owner) {
    return null;
  }

  return {
    id: owner.id,
    username: owner.username,
  };
}

export function serializeClubBook(book: ClubBook | null | undefined): ClientClubBook | null {
  if (!book) {
    return null;
  }

  const {
    fileHash: _fileHash,
    storagePath: _storagePath,
    encryptedContentKey: _encryptedContentKey,
    ...safeBook
  } = book;

  return safeBook;
}

export function serializeClub(club: ClubWithDetails, viewerMembershipRole?: ClubMemberRole | null): ClientClub {
  const { owner, book, books, ...safeClub } = club;
  const serializedClub: ClientClub = {
    ...safeClub,
    owner: serializeClubOwner(owner),
    book: serializeClubBook(book),
  };

  if (books) {
    serializedClub.books = books
      .map((entry) => serializeClubBook(entry))
      .filter((entry): entry is ClientClubBook => entry !== null);
  }

  if (viewerMembershipRole !== undefined) {
    serializedClub.viewerMembershipRole = viewerMembershipRole;
  }

  return serializedClub;
}

export function serializeClubList(clubs: ClubWithDetails[]): ClientClub[] {
  return clubs.map((club) => serializeClub(club));
}

export function serializePublicCatalogClubList(clubs: ClubWithDetails[]): ClientPublicCatalogClub[] {
  return clubs.map((club) => ({
    id: club.id,
    title: club.title,
    description: club.description ?? null,
    coverImage: club.coverImage ?? null,
    bookTitle: club.book?.title ?? null,
    author: club.book?.author ?? null,
    bookCoverUrl: club.book?.coverUrl ?? null,
    type: club.type,
    isPrivate: club.isPrivate,
    isLive: club.isLive,
    memberCount: club.memberCount ?? 0,
    maxMembers: club.maxMembers,
    tags: club.tags ?? [],
  }));
}

export function serializeClubMember(member: ClientClubMember): ClientClubMember {
  return {
    id: member.id,
    username: member.username,
    role: member.role,
    joinedAt: member.joinedAt,
  };
}

export function serializeClubMembers(members: ClientClubMember[]): ClientClubMember[] {
  return members.map((member) => serializeClubMember(member));
}
