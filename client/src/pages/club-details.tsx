import type { ClubMemberRole, ClubWithDetails } from "@shared/schema";
import { useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  Edit2,
  Loader2,
  Lock,
  LogIn,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Share2,
  Star,
  Trash2,
  UserCheck,
  UserX,
  Volume2,
  VolumeX,
  Users,
  Layers,
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { getClubCoverUrl } from "@/lib/club-cover";
import { ClubSettingsModal } from "@/components/club/club-settings-modal";
import { EditClubBookDialog } from "@/components/club/EditClubBookDialog";
import { InvitationsList } from "@/components/club/invitations-list";
import { InviteMemberModal } from "@/components/club/invite-member-modal";
import { ReadingPlan } from "@/components/club/reading-plan";
import { ClubDiscussionBoard } from "@/components/club/ClubDiscussionBoard";
import { BookDescriptionDialog } from "@/components/club/BookDescriptionDialog";
import { AchievementImagePreview } from "@/components/gamification/AchievementImagePreview";
import { TransferOwnershipDialog } from "@/components/club/TransferOwnershipDialog";
import { MainLayout } from "@/components/layout/MainLayout";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { LiveReadersBubble, ActiveReadersModal } from "@/components/studio/LiveReadersBubble";
import { ListenerOverlay } from "@/components/studio/ListenerOverlay";
import { useLiveReaders } from "@/hooks/use-live-readers";
import { useClubLiveListening } from "@/hooks/use-club-live-listening";
import { useClubPresence } from "@/hooks/use-club-presence";
import { useIsMobile } from "@/hooks/use-mobile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativePickerInput } from "@/components/ui/native-picker-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { VoxLibrisUpload } from "@/components/ui/voxlibris-upload";
import { useAuth } from "@/hooks/use-auth";
import { useClubBooks, useDeleteClubBook, useSetActiveBook, type ClubBook } from "@/hooks/use-books-v2";
import { useClub, useClubMembers, useModerateClubMember, useRemoveMember, type ClubDetailsResponse, type ClubMemberWithUser } from "@/hooks/use-clubs";
import { modalConfirm, useToast } from "@/hooks/use-toast";
import type { AuthUserClient } from "@/lib/auth";
import { getAccessToken } from "@/lib/token-store";
import { authFetch } from "@/lib/queryClient";
import { UserContextMenu } from "@/components/social/UserContextMenu";
import { socialApi, type FollowUser } from "@/api/social";
import DOMPurify from "dompurify";

interface ScheduleItem {
  id: string;
  title: string;
  date: string;
  time: string;
  description?: string;
}

interface ClubSettings {
  welcomeTitle?: string;
  welcomeHtml?: string;
  rulesHtml?: string;
  shortDescription?: string;
}

function getRestrictionInfo(until?: Date | string | null, reason?: string | null): string {
  const untilText = until ? `до ${new Date(until).toLocaleString()}` : "бессрочно";
  return reason ? `${untilText}. Причина: ${reason}` : untilText;
}

type ClubWithOptionalBook = ClubDetailsResponse & { book?: ClubDetailsResponse["book"] | null };
const RECOMMEND_PREFIX = "[RECOMMEND]";

type BookRecommendationPayload = {
  type: "book";
  entityId: string;
  title: string;
  subtitle: string;
  imageUrl?: string | null;
  comment?: string | null;
};

type DmConversationCreateResponse = {
  conversation: {
    id: string;
  };
};

function encodeBookRecommendationPayload(payload: BookRecommendationPayload): string {
  return `${RECOMMEND_PREFIX}${JSON.stringify(payload)}`;
}

async function loadAllFollowUsers(
  loader: (userId: string, limit: number, cursor?: string) => Promise<{ users: FollowUser[]; nextCursor: string | null }>,
  userId: string,
): Promise<FollowUser[]> {
  const all: FollowUser[] = [];
  let cursor: string | undefined;

  while (true) {
    const page = await loader(userId, 50, cursor);
    all.push(...page.users);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  return all;
}

// Вспомогательная функция для получения варианта badge по роли
const getMemberRoleBadgeVariant = (role: ClubMemberRole): "default" | "secondary" | "outline" => {
  if (role === "owner") return "default";
  if (role === "moderator") return "secondary";
  return "outline";
};

// Парсинг настроек клуба
const parseClubSettings = (settings: string | null): ClubSettings => {
  if (!settings) return {};
  try {
    const parsed = JSON.parse(settings) as ClubSettings;
    return {
      ...parsed,
      welcomeHtml: parsed.welcomeHtml
        ? DOMPurify.sanitize(parsed.welcomeHtml, {
            ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "b", "i", "a", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"],
            ALLOWED_ATTR: ["href", "target", "rel"],
          })
        : undefined,
      rulesHtml: parsed.rulesHtml
        ? DOMPurify.sanitize(parsed.rulesHtml, {
            ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "b", "i", "a", "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6"],
            ALLOWED_ATTR: ["href", "target", "rel"],
          })
        : undefined,
    };
  } catch {
    return {};
  }
};

// Парсинг расписания
const parseSchedule = (schedule: string | null): ScheduleItem[] => {
  if (!schedule) return [];
  try {
    return JSON.parse(schedule) as ScheduleItem[];
  } catch {
    return [];
  }
};

// Получение символа для иконки достижения
function getAchievementIconSymbol(iconType: string): string {
  if (iconType === "star") return "★";
  if (iconType === "title") return "T";
  return "🏅";
}

const ClubNotFound = () => (
  <MainLayout>
    <div className="container px-4 py-8 text-center sm:px-6 md:px-12 md:py-12">
      <p className="text-muted-foreground">Клуб не найден</p>
    </div>
  </MainLayout>
);

const ClubLoading = () => (
  <MainLayout>
    <div className="container px-4 py-8 sm:px-6 md:px-12 md:py-12">
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Загружаем клуб...</span>
      </div>
    </div>
  </MainLayout>
);

const ClubAuthRequired = () => (
  <MainLayout>
    <div className="container flex justify-center px-4 py-8 sm:px-6 md:px-12 md:py-12">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <LogIn className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle>Требуется авторизация</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Доступ к клубам доступен только авторизованным пользователям. Войдите в систему
            или зарегистрируйтесь, чтобы присоединиться к клубам чтения.
          </p>
          <p className="text-sm text-muted-foreground">
            В будущих версиях вы сможете запросить приглашение в клуб прямо с карточки клуба.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild>
              <Link href="/auth/login">
                <LogIn className="h-4 w-4 mr-2" />
                Войти
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/auth/register">Зарегистрироваться</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </MainLayout>
);

type RemoveMemberMutation = ReturnType<typeof useRemoveMember>;
type DeleteBookMutation = ReturnType<typeof useDeleteClubBook>;
type ToastFn = ReturnType<typeof useToast>['toast'];

// Helper functions to reduce cognitive complexity
function useClubErrorHandling(error: unknown, setLocation: (path: string) => void) {
  if (!error) return null;

  const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
  const isAuthError = errorMessage.includes("Сессия истекла") ||
    errorMessage.includes("войдите") ||
    errorMessage.includes("401") ||
    errorMessage.includes("Authentication");
  
  if (isAuthError) return <ClubAuthRequired />;
  
  const isPrivateClubError = errorMessage.includes("закрытый клуб") ||
    errorMessage.includes("PRIVATE_CLUB_ACCESS_DENIED") ||
    errorMessage.includes("приглашение");
  
  if (isPrivateClubError) {
      return (
        <MainLayout>
          <div className="container flex justify-center px-4 py-8 sm:px-6 md:px-12 md:py-12">
            <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center">
                <Lock className="h-6 w-6 text-amber-600" />
              </div>
              <CardTitle>Закрытый клуб</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                Это закрытый клуб. Для доступа необходимо получить приглашение от участника клуба.
              </p>
              <p className="text-sm text-muted-foreground">
                В будущих версиях вы сможете запросить приглашение прямо с карточки клуба.
              </p>
              <Button variant="outline" onClick={() => setLocation("/clubs")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Вернуться к списку клубов
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }
  
  return (
    <MainLayout>
      <div className="container px-4 py-8 text-center sm:px-6 md:px-12 md:py-12">
        <p className="text-red-600 mb-2">Ошибка загрузки клуба</p>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      </div>
    </MainLayout>
  );
}

function useClubPermissions(currentUserRole: ClubMemberRole | null | undefined, user: AuthUserClient | null) {
  const isOwner = currentUserRole === "owner";
  const isModerator = currentUserRole === "moderator";
  const isMember = Boolean(currentUserRole);
  
  const canRemove = (memberRole: string, memberId: string) => {
    if (!user?.id || memberId === user.id) return false;
    if (isOwner) return memberRole !== "owner";
    if (isModerator) return memberRole === "member";
    return false;
  };
  
  return { isOwner, isModerator, isMember, canRemove };
}

function useClubActions({
  clubId,
  club,
  user,
  isOwner,
  toast,
  setLocation,
  removeMemberMutation,
  deleteBookMutation,
}: {
  clubId: string;
  club: ClubWithDetails | null;
  user: AuthUserClient | null;
  isOwner: boolean;
  toast: ToastFn;
  setLocation: (path: string) => void;
  removeMemberMutation: RemoveMemberMutation;
  deleteBookMutation: DeleteBookMutation;
}) {
  const handleRemoveMember = async (memberId: string, memberName: string) => {
    const confirmed = await modalConfirm({
      title: "Удалить участника?",
      description: `Удалить участника «${memberName}» из клуба?`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await removeMemberMutation.mutateAsync({ clubId, userId: memberId });
      toast({ title: "Участник удалён", description: `${memberName} больше не состоит в клубе.` });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось удалить участника";
      toast({
        title: "Ошибка удаления",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDeleteBook = async () => {
    if (!club?.book?.id) return;
    const confirmed = await modalConfirm({
      title: "Удалить книгу из клуба?",
      description: `Удалить книгу «${club.book.title}» из клуба? Это действие необратимо.`,
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteBookMutation.mutateAsync(club.book.id);
      toast({
        title: "Книга удалена",
        description: "Книга успешно удалена из клуба",
      });
      globalThis.location.reload();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось удалить книгу";
      toast({
        title: "Ошибка удаления",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleLeaveClub = async () => {
    if (!user?.id) return;
    if (isOwner) {
      toast({
        title: "Невозможно выйти",
        description: "Владелец не может покинуть клуб. Сначала передайте права другому участнику.",
        variant: "destructive",
      });
      return;
    }

    try {
      await removeMemberMutation.mutateAsync({ clubId, userId: user.id });
      toast({
        title: "Вы покинули клуб",
        description: "До новых встреч!",
      });
      setLocation("/clubs");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось выйти из клуба";
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleCleanupChat = async (olderThanDays: number) => {
    if (!isOwner) return;

    try {
      const res = await fetch(
        `/api/clubs/${clubId}/chat/cleanup?olderThanDays=${olderThanDays}`,
        {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken() || ""}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Не удалось очистить чат");
      }

      const data = await res.json().catch(() => ({}));
      toast({
        title: "Чат очищен",
        description: `Удалено сообщений: ${data.deletedCount ?? 0}`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Не удалось очистить чат";
      toast({
        title: "Ошибка очистки чата",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return { handleRemoveMember, handleDeleteBook, handleLeaveClub, handleCleanupChat };
}

// Component: Club Header
interface ClubHeaderProps {
  readonly club: ClubWithOptionalBook;
  readonly members: ClubMemberWithUser[];
  readonly isOwner: boolean;
  readonly isMember: boolean;
  readonly removeMemberMutation: RemoveMemberMutation;
  readonly handleLeaveClub: () => void;
  readonly setLocation: (path: string) => void;
  readonly user: AuthUserClient | null;
  readonly onOwnershipTransferred: () => void;
}

function ClubHeader({ club, members, isOwner, isMember, removeMemberMutation, handleLeaveClub, setLocation, user, onOwnershipTransferred }: ClubHeaderProps) {
  return (
    <div className="relative min-h-[18rem] w-full overflow-hidden md:min-h-[22rem] lg:min-h-[26rem]">
      <img
        src={getClubCoverUrl(club.coverImage)}
        alt={club.title}
        className="absolute inset-0 w-full h-full object-cover"
      />

      <div className="container relative flex h-full flex-col justify-between px-4 py-6 sm:px-6 md:px-12 md:py-8">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/clubs")}
            className="h-9 w-full justify-center text-white hover:bg-white/20 sm:w-auto"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к моим клубам
          </Button>
        </div>

        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {club.isPrivate && (
                <Badge
                  variant="secondary"
                  className="bg-yellow-500/20 text-yellow-200 border-none"
                >
                  Приватный
                </Badge>
              )}
              {club.tags?.map((tag: string) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="bg-accent text-accent-foreground border-none"
                >
                  {tag}
                </Badge>
              ))}
            </div>
            <h1 className="text-3xl font-serif font-bold text-white shadow-sm sm:text-4xl md:text-5xl">
              {club.title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/80">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" /> {club.memberCount || members.length}/
                {club.maxMembers} Участников
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" /> Создан{" "}
                {new Date(club.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap md:justify-end">
            {isMember && (
              <>
                {isOwner && (
                  <>
                    <ClubSettingsModal club={club} />
                    {user && members.length > 1 && (
                      <TransferOwnershipDialog
                        clubId={club.id}
                        clubTitle={club.title}
                        members={members}
                        currentUserId={user.id}
                        onSuccess={onOwnershipTransferred}
                      />
                    )}
                  </>
                )}
                {!isOwner && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="w-full bg-white/10 text-white border-white/20 hover:bg-white/20 sm:w-auto"
                    onClick={handleLeaveClub}
                    disabled={removeMemberMutation.isPending}
                  >
                    {removeMemberMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Выходим...
                      </>
                    ) : (
                      <>
                        <LogOut className="w-4 h-4 mr-2" />
                        Выйти из клуба
                      </>
                    )}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Component: Current Book Card
interface CurrentBookCardProps {
  readonly club: ClubWithOptionalBook;
  readonly clubId: string;
  readonly isOwner: boolean;
  readonly isMember: boolean;
  readonly handleDeleteBook: () => void;
  readonly deleteBookMutation: DeleteBookMutation;
  readonly setLocation: (path: string) => void;
}

function CurrentBookCard({ club, clubId, isOwner, isMember, handleDeleteBook, deleteBookMutation, setLocation }: CurrentBookCardProps) {
  const [showDescriptionDialog, setShowDescriptionDialog] = useState(false);

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 font-serif text-lg font-bold sm:text-xl">Текущая книга</h3>
      {club.book ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-full max-w-[7rem] shrink-0 overflow-hidden rounded-md shadow-md sm:w-20 md:w-24">
              {club.book.coverUrl ? (
                <img
                  src={club.book.coverUrl}
                  alt={club.book.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-muted">
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <h4 className="font-semibold leading-tight">{club.book.title}</h4>
              <p className="text-sm text-muted-foreground">{club.book.author}</p>
              {club.book.description && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {club.book.description}
                  </p>
                  {club.book.description.length > 100 && (
                    <button
                      onClick={() => setShowDescriptionDialog(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      Показать полностью...
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            {isMember && club.book && (
              <Button
                onClick={() => {
                  if (!club.book) return;
                  setLocation(`/clubs/${clubId}/books/${club.book.id}/read`);
                }}
                className="w-full"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                Читать
              </Button>
            )}
            {isOwner && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <EditClubBookDialog
                  book={{
                    id: club.book.id,
                    clubId: club.book.clubId,
                    title: club.book.title,
                    author: club.book.author,
                    description: club.book.description || undefined,
                    publicationYear: club.book.publicationYear || undefined,
                    genre: club.book.genre || undefined,
                    language: club.book.language || undefined,
                    format: club.book.format,
                    coverUrl: club.book.coverUrl || undefined,
                    uploadedByUserId: club.book.uploadedByUserId,
                    uploadedAt:
                      typeof club.book.uploadedAt === "string"
                        ? club.book.uploadedAt
                        : club.book.uploadedAt?.toISOString() || "",
                  }}
                  clubId={clubId}
                  onSave={() => globalThis.location.reload()}
                >
                  <Button variant="outline" className="w-full sm:flex-1">
                    <Edit2 className="w-4 h-4 mr-2" />
                    Редактировать
                  </Button>
                </EditClubBookDialog>
                <VoxLibrisUpload
                  defaultContext="club"
                  clubId={clubId}
                  buttonText="Заменить"
                  buttonVariant="outline"
                  onSuccess={() => globalThis.location.reload()}
                />
                <Button
                  variant="outline"
                  className="w-full sm:flex-1"
                  onClick={handleDeleteBook}
                  disabled={deleteBookMutation.isPending}
                >
                  {deleteBookMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Удалить
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 space-y-4">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {isOwner
              ? "Загрузите книгу для начала совместного чтения"
              : "Владелец клуба еще не загрузил книгу"}
          </p>
          {isOwner && (
            <VoxLibrisUpload
              defaultContext="club"
              clubId={clubId}
              buttonText="Загрузить книгу"
              onSuccess={() => globalThis.location.reload()}
            />
          )}
        </div>
      )}

      {club.book?.description && (
        <BookDescriptionDialog
          open={showDescriptionDialog}
          onOpenChange={setShowDescriptionDialog}
          title={club.book.title}
          author={club.book.author}
          description={club.book.description}
        />
      )}
    </div>
  );
}

// Component: Members List Card
interface MembersListCardProps {
  readonly clubId: string;
  readonly clubTitle: string;
  readonly members: ClubMemberWithUser[];
  readonly memberCount: number;
  readonly membersLoading: boolean;
  readonly canViewMembers: boolean;
  readonly isOwner: boolean;
  readonly isModerator: boolean;
  readonly canRemove: (role: string, memberId: string) => boolean;
  readonly handleRemoveMember: (memberId: string, username: string) => void;
}

function MembersListCard({ clubId, clubTitle, members, memberCount, membersLoading, canViewMembers, isOwner, isModerator, canRemove, handleRemoveMember }: MembersListCardProps) {
  const moderateMember = useModerateClubMember();
  const [moderationTarget, setModerationTarget] = useState<{ member: ClubMemberWithUser; action: "mute" | "deactivate" } | null>(null);
  const [moderationDate, setModerationDate] = useState("");
  const [moderationTime, setModerationTime] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const { data: presenceData } = useQuery<{ onlineUserIds: string[] }>({
    queryKey: ["/api/presence/club", clubId],
    queryFn: () => authFetch(`/api/presence/club/${clubId}`).then(r => r.json()) as Promise<{ onlineUserIds: string[] }>,
    refetchInterval: 15_000,
    staleTime: 0,
  });
  const onlineSet = new Set(presenceData?.onlineUserIds ?? []);

  const submitModeration = () => {
    if (!moderationTarget) return;
    const until = moderationDate && moderationTime ? new Date(`${moderationDate}T${moderationTime}`).toISOString() : null;
    moderateMember.mutate({
      clubId,
      userId: moderationTarget.member.id,
      action: moderationTarget.action,
      until,
      reason: moderationReason.trim() || null,
    });
    setModerationTarget(null);
    setModerationDate("");
    setModerationTime("");
    setModerationReason("");
  };

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 flex flex-col gap-3 font-serif text-lg font-bold sm:flex-row sm:items-center sm:justify-between sm:text-xl">
        <span>Участники</span>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Badge variant="outline" className="font-sans font-normal text-xs">
            {membersLoading ? "Загрузка..." : `${memberCount} участников`}
          </Badge>
          {canViewMembers && (isOwner || isModerator) && (
            <InviteMemberModal clubId={clubId} clubTitle={clubTitle} />
          )}
        </div>
      </h3>
      {canViewMembers ? (
        <div className="space-y-4">
          {membersLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Загружаем участников...
              </span>
            </div>
          ) : (
            <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1 sm:max-h-[32rem]">
              {members.map((member) => {
                const memberRating = (member.readerRating ?? 0) / 100;
                const compactAchievements = (member.achievements ?? []).slice(0, 3);
                const isMuted = member.mutedUntil ? new Date(member.mutedUntil).getTime() > Date.now() : false;
                const isDeactivated = member.isActive === false || (member.deactivatedUntil ? new Date(member.deactivatedUntil).getTime() > Date.now() : false);

                return (
                <div key={member.id} className="grid gap-3 rounded-xl border border-border/60 p-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:border-0 xl:p-0">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="relative shrink-0">
                      <UserContextMenu user={{ id: member.id, username: member.username, displayName: member.displayName }} actions={["profile"]}>
                        <div className="cursor-pointer">
                          <Avatar>
                            {member.avatar && <AvatarImage src={member.avatar} alt={member.displayName || member.username} />}
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                              {(member.displayName || member.username).substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                      </UserContextMenu>
                      {onlineSet.has(String(member.id)) && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-background" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.displayName || member.username}</p>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span>
                          Присоединился {new Date(member.joinedAt).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span>Рейтинг: {memberRating.toFixed(1)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {compactAchievements.map((achievement) => (
                          <div
                            key={achievement.achievementId}
                            title={achievement.titleRu}
                            className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30 text-[10px]"
                          >
                            {achievement.badgeImageUrl ? (
                              <AchievementImagePreview
                                src={achievement.badgeImageUrl}
                                alt={achievement.titleRu}
                                triggerClassName="h-5 w-5"
                              />
                             ) : (
                               <span>
                                 {getAchievementIconSymbol(achievement.iconType)}
                               </span>
                             )}
                          </div>
                        ))}
                        {compactAchievements.length === 0 ? (
                          <span className="text-[10px] text-muted-foreground">Без достижений</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
                    <Badge variant={getMemberRoleBadgeVariant(member.role)} className="shrink-0">
                      {member.role === "owner" && "Владелец"}
                        {member.role === "moderator" && "Модератор"}
                        {member.role === "member" && "Участник"}
                    </Badge>
                    {isMuted && <Badge variant="secondary" title={getRestrictionInfo(member.mutedUntil, member.restrictionReason)}>Без права писать</Badge>}
                    {isDeactivated && <Badge variant="destructive" title={getRestrictionInfo(member.deactivatedUntil, member.restrictionReason)}>Доступ ограничен</Badge>}
                    {(isOwner || isModerator) && canRemove(member.role, member.id) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="justify-center"
                            title={isMuted ? "Разрешить писать" : "Запретить писать"}
                            aria-label={isMuted ? "Разрешить писать" : "Запретить писать"}
                            onClick={() => {
                              if (isMuted) {
                                moderateMember.mutate({ clubId, userId: member.id, action: "unmute" });
                              } else {
                                setModerationTarget({ member, action: "mute" });
                              }
                            }}
                          >
                            {isMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="justify-center"
                            title={isDeactivated ? "Вернуть доступ" : "Ограничить доступ"}
                            aria-label={isDeactivated ? "Вернуть доступ" : "Ограничить доступ"}
                            onClick={() => {
                              if (isDeactivated) {
                                moderateMember.mutate({ clubId, userId: member.id, action: "reactivate" });
                              } else {
                                setModerationTarget({ member, action: "deactivate" });
                              }
                            }}
                          >
                            {isDeactivated ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="justify-center text-destructive"
                            title="Исключить из клуба"
                            aria-label="Исключить из клуба"
                            onClick={() => handleRemoveMember(member.id, member.username)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
          Список участников доступен только участникам клуба и модераторам.
        </div>
      )}
      <Dialog open={!!moderationTarget} onOpenChange={(open) => !open && setModerationTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{moderationTarget?.action === "mute" ? "Запретить участнику писать" : "Ограничить доступ участника"}</DialogTitle>
            <DialogDescription>
              {moderationTarget?.member.displayName || moderationTarget?.member.username}. Дату можно не указывать — ограничение будет бессрочным до ручной отмены.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="moderation-date">Дата окончания</Label>
                <NativePickerInput id="moderation-date" type="date" value={moderationDate} onChange={(event) => setModerationDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moderation-time">Время окончания</Label>
                <NativePickerInput id="moderation-time" type="time" value={moderationTime} onChange={(event) => setModerationTime(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="moderation-reason">Причина</Label>
              <Textarea id="moderation-reason" value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModerationTarget(null)}>Отмена</Button>
            <Button onClick={submitModeration}>Применить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Component: Club Library Tab
interface ClubLibraryTabProps {
  readonly clubId: string;
  readonly activeBookId: string | null | undefined;
  readonly isOwner: boolean;
  readonly isMember: boolean;
  readonly setLocation: (path: string) => void;
}

function ClubLibraryTab({ clubId, activeBookId, isOwner, isMember, setLocation }: ClubLibraryTabProps) {
  const { user } = useAuth();
  const { data: books = [], isLoading } = useClubBooks(clubId);
  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState<string>("all");
  const [sort, setSort] = useState<"title_asc" | "title_desc" | "author_asc" | "created_desc" | "genre_asc">("created_desc");
  const [groupByGenre, setGroupByGenre] = useState<"none" | "primary_genre">("none");
  const setActiveBook = useSetActiveBook(clubId);
  const deleteBookMutation = useDeleteClubBook(clubId);
  const [recommendBook, setRecommendBook] = useState<ClubBook | null>(null);
  const [recommendTargets, setRecommendTargets] = useState<FollowUser[]>([]);
  const [recommendSelectedUserIds, setRecommendSelectedUserIds] = useState<Set<string>>(new Set());
  const [recommendComment, setRecommendComment] = useState("");
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendSending, setRecommendSending] = useState(false);
  const { toast } = useToast();

  const allTargetsSelected = recommendTargets.length > 0 && recommendSelectedUserIds.size === recommendTargets.length;

  const genreOptions = Array.from(
    new Map(
      books
        .filter((book) => book.primaryGenre)
        .map((book) => [book.primaryGenre!.code, book.primaryGenre!.label]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1], "ru"));

  const formatBookGenres = (book: ClubBook) => {
    const labels = (book.genres || []).map((genre) => genre.label).filter(Boolean);
    if (labels.length > 0) {
      return labels.join(", ");
    }

    return book.primaryGenre?.label || book.genre || "";
  };

  const filteredBooks = books
    .filter((book) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const title = book.title.toLowerCase();
      const author = book.author.toLowerCase();
      const genre = formatBookGenres(book).toLowerCase();
      return title.includes(q) || author.includes(q) || genre.includes(q);
    })
    .filter((book) => {
      if (genreFilter === "all") return true;
      if (genreFilter === "none") return !book.primaryGenre;
      return book.primaryGenre?.code === genreFilter || (book.genres || []).some((genre) => genre.code === genreFilter);
    })
    .sort((left, right) => {
      if (sort === "created_desc") {
        return new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime();
      }
      if (sort === "title_asc") return left.title.localeCompare(right.title, "ru");
      if (sort === "title_desc") return right.title.localeCompare(left.title, "ru");
      if (sort === "author_asc") return left.author.localeCompare(right.author, "ru");
      const leftGenre = formatBookGenres(left);
      const rightGenre = formatBookGenres(right);
      return leftGenre.localeCompare(rightGenre, "ru");
    });

  const groupedBooks = groupByGenre === "primary_genre"
    ? Array.from(
        filteredBooks.reduce((acc, book) => {
          const key = book.primaryGenre?.code || "none";
          const label = book.primaryGenre?.label || "Без жанра";
          const existing = acc.get(key) || { label, items: [] as ClubBook[] };
          existing.items.push(book);
          acc.set(key, existing);
          return acc;
        }, new Map<string, { label: string; items: ClubBook[] }>()),
      ).map(([key, value]) => ({ key, label: value.label, books: value.items }))
    : [{ key: "all", label: "Все книги", books: filteredBooks }];

  const handleSetActive = async (bookId: string) => {
    setActiveBook.mutate(bookId, {
      onSuccess: () => toast({ title: "Активная книга изменена" }),
      onError: () => toast({ title: "Ошибка", description: "Не удалось изменить активную книгу", variant: "destructive" }),
    });
  };

  const handleDelete = async (book: ClubBook) => {
    const confirmed = await modalConfirm(`Удалить книгу «${book.title}»?`);
    if (!confirmed) return;
    deleteBookMutation.mutate(book.id, {
      onError: () => toast({ title: "Ошибка", description: "Не удалось удалить книгу", variant: "destructive" }),
    });
  };

  const loadRecommendationTargets = async () => {
    if (!user?.id) return;

    setRecommendLoading(true);
    try {
      const [followers, following] = await Promise.all([
        loadAllFollowUsers(socialApi.getFollowers, user.id),
        loadAllFollowUsers(socialApi.getFollowing, user.id),
      ]);

      const uniqueMap = new Map<string, FollowUser>();
      [...followers, ...following].forEach((item) => {
        uniqueMap.set(item.id, item);
      });

      const uniqueTargets = Array.from(uniqueMap.values()).sort((a, b) => {
        const left = a.displayName || a.username;
        const right = b.displayName || b.username;
        return left.localeCompare(right, "ru");
      });

      setRecommendTargets(uniqueTargets);
      setRecommendSelectedUserIds(new Set(uniqueTargets.map((u) => u.id)));
    } catch {
      toast({ title: "Не удалось загрузить получателей", variant: "destructive" });
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleOpenRecommendDialog = (book: ClubBook) => {
    setRecommendBook(book);
    setRecommendComment("");
    setRecommendTargets([]);
    setRecommendSelectedUserIds(new Set());
    void loadRecommendationTargets();
  };

  const handleToggleSelectAllTargets = (checked: boolean) => {
    if (checked) {
      setRecommendSelectedUserIds(new Set(recommendTargets.map((u) => u.id)));
      return;
    }
    setRecommendSelectedUserIds(new Set());
  };

  const toggleRecommendTarget = (targetId: string, checked: boolean) => {
    setRecommendSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(targetId);
      else next.delete(targetId);
      return next;
    });
  };

  const handleSendBookRecommendation = async () => {
    if (!recommendBook) return;
    if (recommendSelectedUserIds.size === 0) {
      toast({ title: "Выберите хотя бы одного получателя", variant: "destructive" });
      return;
    }

    const payload = encodeBookRecommendationPayload({
      type: "book",
      entityId: recommendBook.id,
      title: recommendBook.title,
      subtitle: `Автор: ${recommendBook.author}`,
      imageUrl: recommendBook.coverUrl ?? null,
      comment: recommendComment.trim() || null,
    });

    setRecommendSending(true);
    try {
      const recipientIds = Array.from(recommendSelectedUserIds);
      await Promise.all(recipientIds.map(async (recipientId) => {
        const conv = await authFetch("/api/dm/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId }),
        });
        if (!conv.ok) throw new Error("failed to create conversation");
        const convData = await conv.json() as DmConversationCreateResponse;

        const sent = await authFetch(`/api/dm/conversations/${convData.conversation.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: payload }),
        });
        if (!sent.ok) throw new Error("failed to send message");
      }));

      toast({ title: "Рекомендация отправлена" });
      setRecommendBook(null);
    } catch {
      toast({ title: "Не удалось отправить рекомендацию", variant: "destructive" });
    } finally {
      setRecommendSending(false);
    }
  };

  const renderRecommendTargetsList = () => {
    if (recommendLoading) {
      return (
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка списка пользователей...
        </div>
      );
    }

    if (recommendTargets.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground text-center">
          Нет доступных пользователей для рекомендации.
        </div>
      );
    }

    return (
      <div className="divide-y">
        {recommendTargets.map((target) => {
          const checked = recommendSelectedUserIds.has(target.id);
          const displayName = target.displayName || target.username;
          return (
            <label key={target.id} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/40">
              <Checkbox
                checked={checked}
                onCheckedChange={(value) => toggleRecommendTarget(target.id, value === true)}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">@{target.username}</p>
              </div>
            </label>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (books.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-20" />
        <p>В библиотеке клуба пока нет книг</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Поиск: название, автор, жанр"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Select value={genreFilter} onValueChange={setGenreFilter}>
              <SelectTrigger><SelectValue placeholder="Жанр" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все жанры</SelectItem>
                <SelectItem value="none">Без жанра</SelectItem>
                {genreOptions.map(([code, label]) => (
                  <SelectItem key={code} value={code}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
              <SelectTrigger><SelectValue placeholder="Сортировка" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Сначала новые</SelectItem>
                <SelectItem value="title_asc">Название: А-Я</SelectItem>
                <SelectItem value="title_desc">Название: Я-А</SelectItem>
                <SelectItem value="author_asc">Автор: А-Я</SelectItem>
                <SelectItem value="genre_asc">По жанру</SelectItem>
              </SelectContent>
            </Select>

            <Select value={groupByGenre} onValueChange={(value) => setGroupByGenre(value as typeof groupByGenre)}>
              <SelectTrigger><SelectValue placeholder="Группировка" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Без группировки</SelectItem>
                <SelectItem value="primary_genre">По основному жанру</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {groupedBooks.map((group) => (
      <div key={group.key} className="space-y-2">
        {groupByGenre === "primary_genre" && (
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-muted-foreground" />
            <h4 className="font-semibold">{group.label}</h4>
          </div>
        )}
      {group.books.map((book) => {
        const isActive = book.id === activeBookId;
        return (
          <div key={book.id} className={`flex gap-3 rounded-lg border p-3 ${isActive ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
            <div className="w-12 h-16 shrink-0 overflow-hidden rounded">
              {book.coverUrl ? (
                <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <BookOpen className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight truncate">{book.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                  {formatBookGenres(book) && (
                    <p className="text-xs text-muted-foreground mt-1">Жанры: {formatBookGenres(book)}</p>
                  )}
                </div>
                {isActive && <Badge variant="outline" className="text-xs shrink-0 border-primary/40 text-primary">Активная</Badge>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {isMember && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLocation(`/clubs/${clubId}/books/${book.id}/read`)}>
                    <BookOpen className="w-3 h-3 mr-1" />
                    Читать
                  </Button>
                )}
                {isMember && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleOpenRecommendDialog(book)}>
                    <Share2 className="w-3 h-3 mr-1" />
                    Порекомендовать
                  </Button>
                )}
                {isOwner && !isActive && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSetActive(book.id)} disabled={setActiveBook.isPending}>
                    <Star className="w-3 h-3 mr-1" />
                    Сделать активной
                  </Button>
                )}
                {isOwner && (
                  <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(book)} disabled={deleteBookMutation.isPending}>
                    <Trash2 className="w-3 h-3 mr-1" />
                    Удалить
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      </div>
      ))}

      <Dialog open={!!recommendBook} onOpenChange={() => setRecommendBook(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Порекомендовать книгу</DialogTitle>
            <DialogDescription>
              Выберите подписчиков и/или пользователей, на которых вы подписаны. Отправятся только метаданные книги и ваш комментарий.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{recommendBook?.title}</p>
              <p className="text-muted-foreground">{recommendBook?.author}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="club-recommend-comment">Комментарий</Label>
              <Textarea
                id="club-recommend-comment"
                placeholder="Почему рекомендуете эту книгу?"
                maxLength={500}
                value={recommendComment}
                onChange={(e) => setRecommendComment(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="club-recommend-select-all"
                  checked={allTargetsSelected}
                  onCheckedChange={(checked) => handleToggleSelectAllTargets(checked === true)}
                />
                <Label htmlFor="club-recommend-select-all">Выбрать всех</Label>
              </div>
              <span className="text-xs text-muted-foreground">Выбрано: {recommendSelectedUserIds.size}</span>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-md border">
              {renderRecommendTargetsList()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRecommendBook(null)}>
              Отмена
            </Button>
            <Button onClick={() => void handleSendBookRecommendation()} disabled={recommendSending || recommendLoading}>
              {recommendSending ? "Отправляем..." : "Отправить рекомендацию"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Component: Club Content Tabs
interface ClubContentTabsProps {
  readonly clubId: string;
  readonly isMember: boolean;
  readonly isOwner: boolean;
  readonly currentUserId: string;
  readonly settings: ClubSettings;
  readonly scheduleItems: ScheduleItem[];
  readonly activeBookId: string | null | undefined;
  readonly setLocation: (path: string) => void;
  readonly showLibrary?: boolean;
  readonly extraTabs?: Array<{ value: string; label: string; content: React.ReactNode }>;
}

export function ClubContentTabs({ clubId, isMember, isOwner, currentUserId, settings, scheduleItems, activeBookId, setLocation, showLibrary = isMember, extraTabs = [] }: ClubContentTabsProps) {
  const isMobile = useIsMobile();
  const initialTabFromQuery = new URLSearchParams(globalThis.location.search).get('tab');
  const [activeTab, setActiveTab] = useState(initialTabFromQuery === 'discussion' ? 'discussion' : 'about');
  const tabOptions = [
    { value: "about", label: "О клубе" },
    { value: "reading-plan", label: "План чтения" },
    { value: "discussion", label: "Обсуждение" },
    { value: "schedule", label: "Расписание" },
    ...extraTabs.map(({ value, label }) => ({ value, label })),
    ...(showLibrary ? [{ value: "library", label: "Библиотека" }] : []),
  ];

  const triggerClassName = "rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-1 font-medium";

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      {isMobile ? (
        <div className="mb-4 sm:hidden">
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="h-11 w-full rounded-xl">
              <SelectValue placeholder="Выберите раздел клуба" />
            </SelectTrigger>
            <SelectContent>
              {tabOptions.map((tab) => (
                <SelectItem key={tab.value} value={tab.value}>
                  {tab.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <TabsList className="hidden h-auto w-full justify-start gap-6 overflow-x-auto whitespace-nowrap border-b rounded-none bg-transparent px-0 py-0 sm:flex">
        {tabOptions.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} className={triggerClassName}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="reading-plan" className="pt-6 animate-in slide-in-from-bottom-2">
        {isMember ? (
          <ReadingPlan clubId={clubId} isOwner={isOwner} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-secondary/20 rounded-xl border border-dashed">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center shadow-sm">
              <BookOpen className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">План чтения</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                Вступите в клуб, чтобы видеть план чтения и отслеживать прогресс.
              </p>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="about" className="pt-6 space-y-6 animate-in slide-in-from-bottom-2">
        {settings.welcomeHtml || settings.welcomeTitle ? (
          <div className="space-y-4">
            {settings.welcomeTitle && (
              <h3 className="text-2xl font-serif font-bold">{settings.welcomeTitle}</h3>
            )}
            {settings.welcomeHtml && (
              <div
                className="prose prose-stone dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: settings.welcomeHtml }}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              Владелец клуба еще не добавил приветственное сообщение.
            </p>
          </div>
        )}

        <Separator />

        <div>
          <h4 className="font-semibold mb-3">Правила клуба</h4>
          {settings.rulesHtml ? (
            <div
              className="prose prose-stone dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: settings.rulesHtml }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">У этого клуба пока нет правил.</p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="discussion" className="pt-6">
        {isMember ? (
          <ClubDiscussionBoard 
            clubId={clubId} 
            isOwner={isOwner}
            currentUserId={currentUserId}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-secondary/20 rounded-xl border border-dashed">
            <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center shadow-sm">
              <MessageCircle className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-medium">Доска обсуждений</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                Вступите в клуб, чтобы участвовать в обсуждениях.
              </p>
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="schedule" className="pt-6">
        <div className="space-y-4">
          {scheduleItems.length > 0 ? (
            scheduleItems.map((item) => {
              const eventDate = new Date(item.date);
              const isPast = eventDate < new Date();
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-center ${isPast ? "opacity-60" : ""}`}
                >
                  <div
                    className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center font-bold leading-none ${isPast ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
                  >
                    <span className="text-xs uppercase">
                      {eventDate.toLocaleDateString("ru-RU", { month: "short" })}
                    </span>
                    <span className="text-lg">{eventDate.getDate()}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold">{item.title}</h4>
                    {item.description && (
                      <p className="text-sm text-muted-foreground mb-1">{item.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {item.time}
                      </span>
                    </div>
                  </div>
                  {!isPast && (
                    <Button size="sm" variant="secondary" className="w-full sm:w-auto">
                      Напомнить
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Расписание заседаний еще не составлено</p>
            </div>
          )}
        </div>
      </TabsContent>

      {showLibrary ? (
        <TabsContent value="library" className="pt-6 animate-in slide-in-from-bottom-2">
          <ClubLibraryTab
            clubId={clubId}
            activeBookId={activeBookId}
            isOwner={isOwner}
            isMember={isMember}
            setLocation={setLocation}
          />
        </TabsContent>
      ) : null}

      {extraTabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="pt-6 animate-in slide-in-from-bottom-2">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}

export default function ClubDetails() {
  const isMobile = useIsMobile();
  const [, params] = useRoute("/clubs/:id");
  const clubId = params?.id || "";
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canLoadClubData = !!clubId && !authLoading;
  const { data: clubData, isLoading, error } = useClub(clubId, canLoadClubData);
  const viewerMembershipRole = clubData?.viewerMembershipRole ?? null;
  const canViewMembers = Boolean(viewerMembershipRole) || ['admin', 'moderator'].includes(user?.role ?? '');
  const canLoadMembersData = !!clubId && isAuthenticated && !authLoading && canViewMembers;
  const { data: membersData, isLoading: membersLoading } = useClubMembers(clubId, canLoadMembersData);
  const removeMemberMutation = useRemoveMember();
  const deleteBookMutation = useDeleteClubBook(clubId);

  // Вызываем все хуки безусловно (правила React Hooks)
  const errorComponent = useClubErrorHandling(error, setLocation);
  
  const members = Array.isArray(membersData) ? membersData : [];
  const permissions = useClubPermissions(viewerMembershipRole, user);
  const { isOwner, isModerator, isMember, canRemove } = permissions;

  const { handleRemoveMember, handleDeleteBook, handleLeaveClub, handleCleanupChat } = useClubActions({
    clubId,
    club: clubData || null,
    user,
    isOwner,
    toast,
    setLocation,
    removeMemberMutation,
    deleteBookMutation
  });

  // Присутствие на странице клуба — real-time обновление через WebSocket
  useClubPresence(isAuthenticated && !authLoading ? clubId : null, (ids) => {
    queryClient.setQueryData(["/api/presence/club", clubId], { onlineUserIds: ids });
  });

  // Live-чтецы (хук вызывается безусловно, bookId может быть пустым)
  const activeBookId = clubData?.bookId ?? "";
  const { readers, flashCount } = useLiveReaders({
    clubId,
    bookId: activeBookId,
    listeningToSessionId: null,
  });
  const {
    listeningState,
    listeningReader,
    startListening,
    stopListening,
  } = useClubLiveListening({
    clubId,
    bookId: activeBookId,
    bookTitle: clubData?.book?.title ?? "",
    bookAuthor: clubData?.book?.author ?? undefined,
    coverUrl: clubData?.book?.coverUrl ?? null,
  });

  // Теперь обрабатываем условия после всех хуков
  if (!clubId) return <ClubNotFound />;
  if (authLoading) return <ClubLoading />;
  if (isLoading) return <ClubLoading />;
  if (errorComponent) return errorComponent;

  if (!clubData) {
    return (
      <MainLayout>
        <div className="container px-4 py-8 text-center sm:px-6 md:px-12 md:py-12">
          <p className="text-muted-foreground">Клуб не найден</p>
        </div>
      </MainLayout>
    );
  }

  // После всех проверок clubData гарантированно не null
  const club = clubData;
  const settings = parseClubSettings(clubData.settings);
  const scheduleItems = parseSchedule(clubData.schedule);

  // Диагностический лог только для режима разработки
  if (import.meta.env.DEV) {
    console.warn("[ClubDetails] Загружены настройки клуба:", {
      rawSettings: clubData.settings,
      parsedSettings: settings,
      welcomeHtml: settings.welcomeHtml?.substring(0, 50),
      rulesHtml: settings.rulesHtml?.substring(0, 50),
    });
  }

  return (
    <MainLayout>
      <div className={cn("transition-[filter] duration-300", listeningState && "blur-sm pointer-events-none select-none")}>
        <ClubHeader 
          club={club}
          members={members}
          isOwner={isOwner}
          isMember={isMember}
          removeMemberMutation={removeMemberMutation}
          handleLeaveClub={handleLeaveClub}
          setLocation={setLocation}
          user={user}
          onOwnershipTransferred={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/clubs", clubId] });
            queryClient.invalidateQueries({ queryKey: ["/api/clubs", clubId, "members"] });
            globalThis.location.reload();
          }}
        />

        <div className="container grid grid-cols-1 gap-4 px-4 py-6 sm:gap-6 sm:px-6 md:px-12 md:py-8 lg:grid-cols-3 lg:gap-8 xl:gap-12">
          <div className="order-1 space-y-6 lg:col-span-1 lg:space-y-8">
            <CurrentBookCard
              club={club}
              clubId={clubId}
              isOwner={isOwner}
              isMember={isMember}
              handleDeleteBook={handleDeleteBook}
              deleteBookMutation={deleteBookMutation}
              setLocation={setLocation}
            />

            <MembersListCard
              clubId={clubId}
              clubTitle={club.title}
              members={members}
              memberCount={club.memberCount || members.length}
              membersLoading={membersLoading}
              canViewMembers={canViewMembers}
              isOwner={isOwner}
              isModerator={isModerator}
              canRemove={canRemove}
              handleRemoveMember={handleRemoveMember}
            />

            {(isOwner || isModerator) && (
              <div className="space-y-3">
                <InvitationsList clubId={clubId} isOwner={isOwner} />
              </div>
            )}
          </div>

          <div className="order-2 lg:col-span-2">
            <ClubContentTabs
              clubId={clubId}
              isMember={isMember}
              isOwner={isOwner}
              currentUserId={user?.id || ''}
              settings={settings}
              scheduleItems={scheduleItems}
              activeBookId={club.bookId}
              setLocation={setLocation}
            />
          </div>
        </div>

        {isAuthenticated && isMember && (
          <ChatWidget 
            clubId={club.id} 
            onCleanupDeleted={() => handleCleanupChat(0)}
            canCleanup={isOwner}
            mobileBottomOffsetPx={88}
            mobileTopOffsetPx={76}
          />
        )}

        {isAuthenticated && isMember && activeBookId && (
          <div className={cn(
            "fixed z-30 transition-transform duration-300 ease-out",
            isMobile
              ? "bottom-[calc(env(safe-area-inset-bottom)+9rem)] right-3 translate-x-0 pr-0"
              : "bottom-20 right-0 translate-x-[calc(100%-4rem)] pr-4 hover:translate-x-0 focus-within:translate-x-0",
          )}>
            <LiveReadersBubble
              readers={readers}
              flashCount={flashCount}
              onOpenModal={() => setLiveModalOpen(true)}
              compact={isMobile}
            />
          </div>
        )}
      </div>

      {isAuthenticated && isMember && activeBookId && (
        <ActiveReadersModal
          open={liveModalOpen}
          onClose={() => setLiveModalOpen(false)}
          readers={readers}
          listeningToSessionId={listeningReader?.sessionId ?? null}
          onPlay={async (reader) => {
            await startListening(reader);
          }}
          onStop={async () => {
            stopListening();
          }}
        />
      )}

      {listeningState && (
        <ListenerOverlay
          reader={listeningState.reader}
          bookTitle={listeningState.bookTitle}
          bookAuthor={listeningState.bookAuthor}
          coverUrl={listeningState.coverUrl}
          isPaused={Boolean(listeningState.reader.isPaused)}
          onStop={() => stopListening()}
          onStreamEnded={() => stopListening({ stopPlayback: false })}
        />
      )}
    </MainLayout>
  );
}
