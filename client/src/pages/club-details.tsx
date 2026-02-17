import type { ClubMemberRole, ClubWithDetails, User } from "@shared/schema";
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
  Trash2,
  Users,
} from "lucide-react";
import { Link, useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ClubSettingsModal } from "@/components/club/club-settings-modal";
import { EditClubBookDialog } from "@/components/club/EditClubBookDialog";
import { InvitationsList } from "@/components/club/invitations-list";
import { InviteMemberModal } from "@/components/club/invite-member-modal";
import { ReadingPlan } from "@/components/club/reading-plan";
import { ClubDiscussionBoard } from "@/components/club/ClubDiscussionBoard";
import { BookDescriptionDialog } from "@/components/club/BookDescriptionDialog";
import { TransferOwnershipDialog } from "@/components/club/TransferOwnershipDialog";
import { MainLayout } from "@/components/layout/MainLayout";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VoxLibrisUpload } from "@/components/ui/voxlibris-upload";
import { useAuth } from "@/hooks/use-auth";
import { useDeleteClubBook } from "@/hooks/use-books-v2";
import { useClub, useClubMembers, useRemoveMember, type ClubMemberWithUser } from "@/hooks/use-clubs";
import { modalConfirm, useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@/lib/token-store";
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

type ClubWithOptionalBook = ClubWithDetails & { book?: ClubWithDetails["book"] | null };

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

const ClubNotFound = () => (
  <MainLayout>
    <div className="container py-12 px-6 md:px-12 text-center">
      <p className="text-muted-foreground">Клуб не найден</p>
    </div>
  </MainLayout>
);

const ClubLoading = () => (
  <MainLayout>
    <div className="container py-12 px-6 md:px-12">
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Загружаем клуб...</span>
      </div>
    </div>
  </MainLayout>
);

const ClubAuthRequired = () => (
  <MainLayout>
    <div className="container py-12 px-6 md:px-12 flex justify-center">
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
        <div className="container py-12 px-6 md:px-12 flex justify-center">
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
      <div className="container py-12 px-6 md:px-12 text-center">
        <p className="text-red-600 mb-2">Ошибка загрузки клуба</p>
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      </div>
    </MainLayout>
  );
}

function useClubPermissions(members: ClubMemberWithUser[], user: User | null) {
  const currentUserMember = members.find((m) => m.id === user?.id);
  const isOwner = currentUserMember?.role === "owner";
  const isModerator = currentUserMember?.role === "moderator";
  const isMember = !!currentUserMember;
  
  const canRemove = (memberRole: string, memberId: string) => {
    if (!user?.id || memberId === user.id) return false;
    if (isOwner) return memberRole !== "owner";
    if (isModerator) return memberRole === "member";
    return false;
  };
  
  return { isOwner, isModerator, isMember, canRemove, currentUserMember };
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
  user: User | null;
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
  readonly user: User | null;
  readonly onOwnershipTransferred: () => void;
}

function ClubHeader({ club, members, isOwner, isMember, removeMemberMutation, handleLeaveClub, setLocation, user, onOwnershipTransferred }: ClubHeaderProps) {
  return (
    <div className="relative h-48 md:h-64 lg:h-80 w-full overflow-hidden">
      {club.coverImage ? (
        <img
          src={club.coverImage}
          alt={club.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-primary/90" />
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-50" />

      <div className="container relative h-full flex flex-col justify-between py-8 px-6 md:px-12">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/clubs")}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к моим клубам
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4 max-w-2xl">
            <div className="flex gap-2 items-center">
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
            <h1 className="text-3xl md:text-5xl font-serif font-bold text-white shadow-sm">
              {club.title}
            </h1>
            <div className="flex items-center gap-4 text-white/80 text-sm">
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

          <div className="flex gap-3">
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
                    className="bg-white/10 text-white border-white/20 hover:bg-white/20"
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
    <div className="bg-card rounded-xl border p-6 shadow-sm">
      <h3 className="font-serif font-bold text-xl mb-4">Текущая книга</h3>
      {club.book ? (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="w-20 md:w-24 shrink-0 rounded-md overflow-hidden shadow-md">
              {club.book.coverUrl ? (
                <img
                  src={club.book.coverUrl}
                  alt={club.book.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-32 bg-muted flex items-center justify-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="space-y-2 flex-1">
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
              <div className="flex flex-wrap gap-2">
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
                  <Button variant="outline" className="flex-1">
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
                  className="flex-1"
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
  readonly membersLoading: boolean;
  readonly isOwner: boolean;
  readonly isModerator: boolean;
  readonly canRemove: (role: string, memberId: string) => boolean;
  readonly handleRemoveMember: (memberId: string, username: string) => void;
}

function MembersListCard({ clubId, clubTitle, members, membersLoading, isOwner, isModerator, canRemove, handleRemoveMember }: MembersListCardProps) {
  return (
    <div className="bg-card rounded-xl border p-6 shadow-sm">
      <h3 className="font-serif font-bold text-xl mb-4 flex items-center justify-between">
        <span>Участники</span>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-sans font-normal text-xs">
            {membersLoading ? "Загрузка..." : `${members.length} участников`}
          </Badge>
          {(isOwner || isModerator) && (
            <InviteMemberModal clubId={clubId} clubTitle={clubTitle} />
          )}
        </div>
      </h3>
      <div className="space-y-4">
        {membersLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Загружаем участников...
            </span>
          </div>
        ) : (
          members.map((member) => (
            <div key={member.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">
                    {member.username.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{member.username}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>
                      Присоединился {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={getMemberRoleBadgeVariant(member.role)}>
                  {member.role === "owner" && "Владелец"}
                  {member.role === "moderator" && "Модератор"}
                  {member.role === "member" && "Участник"}
                </Badge>
                {(isOwner || isModerator) && canRemove(member.role, member.id) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleRemoveMember(member.id, member.username)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" /> Удалить из клуба
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))
        )}
      </div>
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
}

function ClubContentTabs({ clubId, isMember, isOwner, currentUserId, settings, scheduleItems }: ClubContentTabsProps) {
  return (
    <Tabs defaultValue="about" className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-2 sm:gap-6 overflow-x-auto whitespace-nowrap">
        <TabsTrigger
          value="about"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-1 font-medium"
        >
          О клубе
        </TabsTrigger>
        <TabsTrigger
          value="reading-plan"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-1 font-medium"
        >
          План чтения
        </TabsTrigger>
        <TabsTrigger
          value="discussion"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-1 font-medium"
        >
          Обсуждение
        </TabsTrigger>
        <TabsTrigger
          value="schedule"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none py-3 px-1 font-medium"
        >
          Расписание
        </TabsTrigger>
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
                  className={`flex items-center gap-4 p-4 border rounded-lg bg-card ${isPast ? "opacity-60" : ""}`}
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
                    <Button size="sm" variant="secondary">
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
    </Tabs>
  );
}

export default function ClubDetails() {
  const [, params] = useRoute("/clubs/:id");
  const clubId = params?.id || "";
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canLoadClubData = !!clubId && isAuthenticated && !authLoading;
  const { data: clubData, isLoading, error } = useClub(clubId, canLoadClubData);
  const { data: membersData, isLoading: membersLoading } = useClubMembers(clubId, canLoadClubData);
  const removeMemberMutation = useRemoveMember();
  const deleteBookMutation = useDeleteClubBook(clubId);

  // Вызываем все хуки безусловно (правила React Hooks)
  const errorComponent = useClubErrorHandling(error, setLocation);
  
  const members = Array.isArray(membersData) ? membersData : [];
  const permissions = useClubPermissions(members, user);
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

  // Теперь обрабатываем условия после всех хуков
  if (!clubId) return <ClubNotFound />;
  if (authLoading) return <ClubLoading />;
  if (!isAuthenticated) return <ClubAuthRequired />;
  if (isLoading) return <ClubLoading />;
  if (errorComponent) return errorComponent;

  if (!clubData) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12 text-center">
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

      <div className="container py-8 px-4 md:px-12 grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 md:gap-8 lg:gap-12">
        <div className="lg:col-span-1 space-y-8">
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
            membersLoading={membersLoading}
            isOwner={isOwner}
            isModerator={isModerator}
            canRemove={canRemove}
            handleRemoveMember={handleRemoveMember}
          />

          {(isOwner || isModerator) && (
            <div className="mt-6 space-y-3">
              <InvitationsList clubId={clubId} isOwner={isOwner} />
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <ClubContentTabs
            clubId={clubId}
            isMember={isMember}
            isOwner={isOwner}
            currentUserId={user?.id || ''}
            settings={settings}
            scheduleItems={scheduleItems}
          />
        </div>
      </div>

      <ChatWidget 
        clubId={club.id} 
        onCleanupDeleted={() => handleCleanupChat(0)}
        canCleanup={isOwner}
      />
    </MainLayout>
  );
}
