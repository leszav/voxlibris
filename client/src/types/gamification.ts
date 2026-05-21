export interface ProfileAchievement {
  achievementId: string;
  code: string;
  titleRu: string;
  iconType: "badge" | "star" | "title";
  badgeImageUrl: string | null;
}

export interface ProfileStreakSummary {
  currentStreakDays: number;
  bestStreakDays: number;
  lastActiveDate: string | null;
}

export interface ProfileGamificationResponse {
  success: boolean;
  achievements: ProfileAchievement[];
  streak: ProfileStreakSummary;
}
