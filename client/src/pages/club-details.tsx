import type { ClubMemberRole } from "@shared/schema";
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
import { ClubSettingsModal } from "@/components/club/club-settings-modal";
import { EditClubBookDialog } from "@/components/club/EditClubBookDialog";
import { InvitationsList } from "@/components/club/invitations-list";
import { InviteMemberModal } from "@/components/club/invite-member-modal";
import { ReadingPlan } from "@/components/club/reading-plan";
import { MainLayout } from "@/components/layout/MainLayout";
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
import { useClub, useClubMembers, useRemoveMember } from "@/hooks/use-clubs";
import { useToast } from "@/hooks/use-toast";

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
    return JSON.parse(settings) as ClubSettings;
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

// eslint-disable-next-line sonarjs/cognitive-complexity
export default function ClubDetails() {
  const [, params] = useRoute("/clubs/:id");
  const clubId = params?.id || "";
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: clubData, isLoading, error } = useClub(clubId);
  const { data: membersData, isLoading: membersLoading } = useClubMembers(clubId);
  const removeMemberMutation = useRemoveMember();
  const deleteBookMutation = useDeleteClubBook(clubId);

  if (!clubId) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12 text-center">
          <p className="text-muted-foreground">Клуб не найден</p>
        </div>
      </MainLayout>
    );
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Загружаем клуб...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    // Проверяем, является ли ошибка связанной с авторизацией
    const isAuthError =
      error.message?.includes("Сессия истекла") ||
      error.message?.includes("войдите") ||
      error.message?.includes("401") ||
      error.message?.includes("Authentication");

    if (isAuthError) {
      return (
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
                      Войти / Регистрация
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={() => setLocation("/")}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    На главную
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </MainLayout>
      );
    }

    // Проверяем, является ли ошибка ограничением доступа к приватному клубу
    const isPrivateClubError =
      error.message?.includes("закрытый клуб") ||
      error.message?.includes("PRIVATE_CLUB_ACCESS_DENIED") ||
      error.message?.includes("приглашение");

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
          <p className="text-sm text-muted-foreground">{error.message}</p>
        </div>
      </MainLayout>
    );
  }

  if (!clubData) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12 text-center">
          <p className="text-muted-foreground">Клуб не найден</p>
        </div>
      </MainLayout>
    );
  }

  const club = clubData;

  const settings = parseClubSettings(club.settings);
  const scheduleItems = parseSchedule(club.schedule);

  // Диагностический лог только для режима разработки
  if (import.meta.env.DEV) {
    console.log("[ClubDetails] Загружены настройки клуба:", {
      rawSettings: club.settings,
      parsedSettings: settings,
      welcomeHtml: settings.welcomeHtml?.substring(0, 50),
      rulesHtml: settings.rulesHtml?.substring(0, 50),
    });
  }

  // Проверяем роль текущего пользователя
  const members = Array.isArray(membersData) ? membersData : [];
  const currentUserMember = members.find((m) => m.id === user?.id);
  const isOwner = currentUserMember?.role === "owner";
  const isModerator = currentUserMember?.role === "moderator";
  const isMember = !!currentUserMember;

  const canRemove = (memberRole: ClubMemberRole, memberId: string) => {
    if (!user?.id) return false;
    if (memberId === user.id) return false; // для себя отдельная кнопка "Выйти"
    if (isOwner) {
      // Владелец может удалять всех, кроме владельца
      return memberRole !== "owner";
    }
    if (isModerator) {
      // Модератор может удалять только участников
      return memberRole === "member";
    }
    return false;
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Удалить участника «${memberName}» из клуба?`)) return;
    try {
      await removeMemberMutation.mutateAsync({ clubId, userId: memberId });
      toast({ title: "Участник удалён", description: `${memberName} больше не состоит в клубе.` });
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message || "Не удалось удалить участника",
        variant: "destructive",
      });
    }
  };

  const handleDeleteBook = async () => {
    if (!club.book?.id) return;

    if (!confirm(`Удалить книгу «${club.book.title}» из клуба? Это действие необратимо.`)) return;

    try {
      await deleteBookMutation.mutateAsync(club.book.id);
      toast({
        title: "Книга удалена",
        description: "Книга успешно удалена из клуба",
      });
      // Reload to update UI
      globalThis.location.reload();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message || "Не удалось удалить книгу",
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
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось выйти из клуба",
        variant: "destructive",
      });
    }
  };

  return (
    <MainLayout>
      {/* Header / Banner */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
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
                {club.tags?.map((tag) => (
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
                  {isOwner && <ClubSettingsModal club={club} />}
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container py-12 px-6 md:px-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Left Column: Book & Progress */}
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <h3 className="font-serif font-bold text-xl mb-4">Текущая книга</h3>
            {club.book ? (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-24 shrink-0 rounded-md overflow-hidden shadow-md">
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
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {club.book.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Кнопки управления книгой */}
                <div className="flex flex-col gap-2 pt-2">
                  {isMember && club.book && (
                    <Button
                      onClick={() => setLocation(`/clubs/${clubId}/books/${club.book.id}/read`)}
                      className="w-full"
                    >
                      <BookOpen className="w-4 h-4 mr-2" />
                      Читать
                    </Button>
                  )}
                  {isOwner && (
                    <div className="flex gap-2">
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
          </div>

          <div className="bg-card rounded-xl border p-6 shadow-sm">
            <h3 className="font-serif font-bold text-xl mb-4 flex items-center justify-between">
              <span>Участники</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-sans font-normal text-xs">
                  {membersLoading ? "Загрузка..." : `${members.length} участников`}
                </Badge>
                {(isOwner || isModerator) && (
                  <InviteMemberModal clubId={clubId} clubTitle={club.title} />
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

          {/* Invitations List - только для владельца и модератора */}
          {(isOwner || isModerator) && (
            <div className="mt-6">
              <InvitationsList clubId={clubId} isOwner={isOwner} />
            </div>
          )}
        </div>

        {/* Right Column: Content & Tabs */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="about" className="w-full">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent gap-6">
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
              {/* Приветствие */}
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

              {/* Правила */}
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
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-4 bg-secondary/20 rounded-xl border border-dashed">
                <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center shadow-sm">
                  <MessageCircle className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Доска обсуждений</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1">
                    Вступите в клуб, чтобы участвовать в обсуждениях глав и опросах.
                  </p>
                </div>
                <Button variant="outline">Подать заявку</Button>
              </div>
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
        </div>
      </div>
    </MainLayout>
  );
}
