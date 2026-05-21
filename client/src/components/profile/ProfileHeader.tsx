import { Edit, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditProfileDialog } from "@/components/profile/EditProfileDialog";
import { FollowButton } from "@/components/social/FollowButton";
import { SocialStats } from "@/components/social/SocialStats";
import { FollowersList } from "@/components/social/FollowersList";

interface UserProfile {
  displayName: string | null;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
  favoriteGenres: string | null;
  isReader: boolean;
  readerRating: number;
  totalReadingSessions: number;
  totalListeners: number;
  profileQuote?: string | null;
  profileQuoteAuthor?: string | null;
}

interface ProfileHeaderProps {
  readonly profile: UserProfile;
  readonly profileId: string;
  readonly isOwnProfile: boolean;
  readonly currentUserId: string | null;
  readonly onSaveProfile: (data: Partial<UserProfile>) => void;
  readonly savePending: boolean;
  readonly onStartDm: () => void;
}

type FollowersListMode = "followers" | "following";

export function ProfileHeader({
  profile,
  profileId,
  isOwnProfile,
  currentUserId,
  onSaveProfile,
  savePending,
  onStartDm,
}: ProfileHeaderProps) {
  const [followersListMode, setFollowersListMode] = useState<FollowersListMode>("followers");
  const [followersListOpen, setFollowersListOpen] = useState(false);

  const hasQuote = Boolean(profile.profileQuote?.trim());

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col items-start gap-5 md:flex-row md:items-end md:gap-6">
        <Avatar className="h-24 w-24 border-4 border-background shadow-2xl sm:h-28 sm:w-28 md:h-32 md:w-32">
          <AvatarImage src={profile.avatar || ""} />
          <AvatarFallback className="bg-primary/20 text-2xl text-white sm:text-3xl">
            {profile.displayName?.[0] || "П"}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 space-y-2 text-white drop-shadow-lg">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {profile.displayName || "Пользователь"}
            </h1>
            {profile.isReader && (
              <Badge
                variant="secondary"
                className="w-fit bg-white/90 text-primary hover:bg-white"
              >
                🎙️ Чтец
              </Badge>
            )}
          </div>

          {profile.bio && <p className="max-w-2xl text-base text-white/90 sm:text-lg">{profile.bio}</p>}

          {hasQuote && (
            <blockquote className="max-w-2xl border-l-2 border-white/60 pl-3 text-sm italic text-white/90">
              “{profile.profileQuote}”
              {profile.profileQuoteAuthor ? <span className="ml-2 not-italic text-white/70">— {profile.profileQuoteAuthor}</span> : null}
            </blockquote>
          )}
        </div>

        {isOwnProfile && (
          <EditProfileDialog
            profile={profile}
            onSave={onSaveProfile}
            isLoading={savePending}
          >
            <Button
              variant="secondary"
              size="sm"
              className="w-full bg-white/90 backdrop-blur-sm hover:bg-white sm:w-auto"
            >
              <Edit className="h-4 w-4 mr-2" />
              Редактировать
            </Button>
          </EditProfileDialog>
        )}
        {!isOwnProfile && currentUserId && (
          <div className="flex gap-2">
            <FollowButton
              targetUserId={profileId}
              currentUserId={currentUserId}
              className="bg-white/90 backdrop-blur-sm hover:bg-white text-primary"
            />
            <Button
              variant="outline"
              size="sm"
              className="bg-white/90 backdrop-blur-sm hover:bg-white text-primary"
              onClick={onStartDm}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              Написать
            </Button>
          </div>
        )}
      </div>

      <SocialStats
        userId={profileId}
        onFollowersClick={() => { setFollowersListMode("followers"); setFollowersListOpen(true); }}
        onFollowingClick={() => { setFollowersListMode("following"); setFollowersListOpen(true); }}
      />
      <FollowersList
        open={followersListOpen}
        onOpenChange={setFollowersListOpen}
        userId={profileId}
        currentUserId={currentUserId ?? undefined}
        mode={followersListMode}
      />
    </div>
  );
}
