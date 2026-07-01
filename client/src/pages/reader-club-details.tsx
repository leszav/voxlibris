import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, BookOpen, Calendar, Check, Headphones, Loader2, Lock, Mic2, MoreHorizontal, Play, Radio, Trash2, UserCheck, UserX, Users, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getClubCoverUrl } from "@/lib/club-cover";
import { apiRequest } from "@/lib/queryClient";
import { MainLayout } from "@/components/layout/MainLayout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { NativePickerInput } from "@/components/ui/native-picker-input";
import { Textarea } from "@/components/ui/textarea";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { ActiveReadersModal, LiveReadersBubble } from "@/components/studio/LiveReadersBubble";
import { ListenerOverlay } from "@/components/studio/ListenerOverlay";
import { VoxLibrisUpload } from "@/components/ui/voxlibris-upload";
import { ClubSettingsModal } from "@/components/club/club-settings-modal";
import { InvitationsList } from "@/components/club/invitations-list";
import { InviteMemberModal } from "@/components/club/invite-member-modal";
import { ClubContentTabs } from "@/pages/club-details";
import { useAuth } from "@/hooks/use-auth";
import { useClub, useClubMembers, useModerateClubMember, useRemoveMember, type ClubDetailsResponse, type ClubMemberWithUser } from "@/hooks/use-clubs";
import { useLiveReaders } from "@/hooks/use-live-readers";
import { useClubLiveListening } from "@/hooks/use-club-live-listening";
import { useIsMobile } from "@/hooks/use-mobile";
import { modalConfirm, useToast } from "@/hooks/use-toast";

interface ReaderClubDetailsProps {
  clubId: string;
  initialClub?: ClubDetailsResponse;
}

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

type ClubRecordingModerationStatus = "pending" | "approved" | "rejected";

interface ClubRecording {
  id: string;
  title?: string | null;
  publicTitle?: string | null;
  publicAuthor?: string | null;
  publicDescription?: string | null;
  status: "processing" | "ready" | "failed" | "deleted";
  moderationStatus?: ClubRecordingModerationStatus | null;
  moderationNotes?: string | null;
  isPublished?: boolean | null;
  allowStreaming?: boolean | null;
  allowDownload?: boolean | null;
  duration?: number | null;
  createdAt?: string | null;
}

interface ClubRecordingsResponse {
  success: boolean;
  recordings: ClubRecording[];
}

interface ReaderClubAnalyticsSummary {
  totalSessions: number;
  totalListeners: number;
  averageListeners: number;
  totalReactions: number;
  totalQuestions: number;
  averageQuality: number;
}

interface ReaderClubAnalyticsResponse {
  summary: ReaderClubAnalyticsSummary;
  ratings: Array<{
    id: string;
    sessionId: string;
    sessionTitle: string;
    rating: number;
    feedback?: string | null;
    createdAt?: string | null;
    rater?: { id: string; username: string } | null;
  }>;
  questions: Array<{
    id: string;
    sessionId: string;
    sessionTitle: string;
    question: string;
    answer?: string | null;
    isAnswered: boolean;
    createdAt?: string | null;
    answeredAt?: string | null;
    user?: { id: string; username: string } | null;
  }>;
}

function getRecordingStatusLabel(recording: ClubRecording): string {
  if (recording.status !== "ready") {
    return "Файл готовится";
  }
  if (recording.moderationStatus === "approved" && recording.isPublished) {
    return "Опубликована";
  }
  if (recording.moderationStatus === "approved") {
    return "Одобрена, ждёт публикации";
  }
  if (recording.moderationStatus === "rejected") {
    return "Отклонена модерацией";
  }
  return "На модерации";
}

function getRecordingBadgeVariant(recording: ClubRecording): "default" | "secondary" | "outline" | "destructive" {
  if (recording.moderationStatus === "approved" && recording.isPublished) return "default";
  if (recording.moderationStatus === "approved") return "secondary";
  if (recording.moderationStatus === "rejected") return "destructive";
  return "outline";
}

function formatRecordingDate(value?: string | null): string {
  if (!value) return "Дата не указана";
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function getRestrictionInfo(until?: Date | string | null, reason?: string | null): string {
  const untilText = until ? `до ${new Date(until).toLocaleString()}` : "бессрочно";
  return reason ? `${untilText}. Причина: ${reason}` : untilText;
}

function formatMetricValue(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function parseClubSettings(value?: string | null): ClubSettings {
  if (!value) return {};
  try {
    return JSON.parse(value) as ClubSettings;
  } catch {
    return {};
  }
}

function parseSchedule(value?: string | null): ScheduleItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as ScheduleItem[] : [];
  } catch {
    return [];
  }
}

function ReaderClubLoading() {
  return (
    <MainLayout>
      <div className="container flex items-center justify-center px-4 py-12 text-sm text-muted-foreground sm:px-6 md:px-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Загружаем клуб чтецов...
      </div>
    </MainLayout>
  );
}

function ReaderClubNotFound() {
  return (
    <MainLayout>
      <div className="container px-4 py-12 text-center sm:px-6 md:px-12">
        <p className="text-muted-foreground">Клуб чтецов не найден</p>
      </div>
    </MainLayout>
  );
}

export default function ReaderClubDetails({ clubId, initialClub }: ReaderClubDetailsProps) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: loadedClub, isLoading } = useClub(clubId, !!clubId && !initialClub && !authLoading);
  const club = initialClub ?? loadedClub;
  const viewerMembershipRole = club?.viewerMembershipRole ?? null;
  const isMember = Boolean(viewerMembershipRole);
  const isOwner = viewerMembershipRole === "owner" || club?.ownerId === user?.id;
  const canLoadMembers = !!clubId && isAuthenticated && (isMember || isOwner);
  const { data: members = [], isLoading: membersLoading } = useClubMembers(clubId, canLoadMembers);
  const moderateMember = useModerateClubMember();
  const removeMember = useRemoveMember();
  const [moderationTarget, setModerationTarget] = useState<{ member: ClubMemberWithUser; action: "mute" | "deactivate" } | null>(null);
  const [moderationDate, setModerationDate] = useState("");
  const [moderationTime, setModerationTime] = useState("");
  const [moderationReason, setModerationReason] = useState("");
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [playingRecording, setPlayingRecording] = useState<{ id: string; url: string } | null>(null);
  const activeBookId = club?.bookId ?? "";
  const { readers, flashCount } = useLiveReaders({
    clubId,
    bookId: activeBookId,
    listeningToSessionId: null,
  });
  const recordingsQueryKey = ["reader-club-recordings", clubId];
  const { data: clubRecordings = [], isLoading: recordingsLoading } = useQuery({
    queryKey: [...recordingsQueryKey, isOwner ? "manage" : "public"],
    enabled: !!clubId && isAuthenticated && isMember,
    queryFn: async () => {
      const suffix = isOwner ? "?availableOnly=false" : "";
      const response = await apiRequest<ClubRecordingsResponse>(`/api/recordings/clubs/${clubId}/recordings${suffix}`);
      return response.recordings;
    },
  });
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ["reader-club-analytics", clubId],
    enabled: !!clubId && isAuthenticated && isOwner,
    queryFn: async () => {
      return apiRequest<ReaderClubAnalyticsResponse>(`/api/clubs/${clubId}/reader-analytics`);
    },
  });
  const analyticsSummary = analytics?.summary;
  const analyticsRatings = analytics?.ratings ?? [];
  const analyticsQuestions = analytics?.questions ?? [];
  const publicationRecordingMutation = useMutation({
    mutationFn: async ({ recording, isPublished }: { recording: ClubRecording; isPublished: boolean }) => {
      return apiRequest(`/api/recordings/${recording.id}/publication`, {
        method: "PUT",
        body: JSON.stringify({
          isPublished,
          publicTitle: recording.publicTitle || recording.title || "Запись эфира",
          publicAuthor: recording.publicAuthor || user?.displayName || user?.username || null,
          publicDescription: recording.publicDescription || null,
          coverImageUrl: null,
          allowStreaming: isPublished,
          allowDownload: false,
        }),
      });
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: recordingsQueryKey });
      toast({
        title: variables.isPublished ? "Запись опубликована" : "Запись снята с публикации",
        description: variables.isPublished
          ? "После тарифной проверки она будет доступна слушателям для прослушивания."
          : "Слушатели больше не увидят эту запись в публичном доступе.",
      });
    },
    onError: (error, variables) => {
      toast({
        title: variables.isPublished ? "Не удалось опубликовать запись" : "Не удалось снять запись с публикации",
        description: error instanceof Error ? error.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
    },
  });
  const streamRecordingMutation = useMutation({
    mutationFn: async (recording: ClubRecording) => {
      return { recordingId: recording.id, url: `/api/recordings/${recording.id}/stream` };
    },
    onSuccess: ({ recordingId, url }) => {
      setPlayingRecording({ id: recordingId, url });
    },
    onError: (error) => {
      toast({
        title: "Не удалось открыть запись",
        description: error instanceof Error ? error.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
    },
  });
  const {
    listeningState,
    listeningReader,
    startListening,
    stopListening,
  } = useClubLiveListening({
    clubId,
    bookId: activeBookId,
    bookTitle: club?.book?.title ?? "",
    bookAuthor: club?.book?.author ?? undefined,
    coverUrl: club?.book?.coverUrl ?? null,
  });

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

  const handleRemoveMember = async (member: ClubMemberWithUser) => {
    const memberName = member.displayName || member.username;
    const confirmed = await modalConfirm({
      title: "Исключить из клуба?",
      description: `Исключить участника «${memberName}» из клуба чтецов?`,
      confirmLabel: "Исключить",
      cancelLabel: "Отмена",
    });
    if (!confirmed) return;
    removeMember.mutate({ clubId, userId: member.id });
  };

  if (authLoading || isLoading) {
    return <ReaderClubLoading />;
  }

  if (!club || club.type !== "reader-led") {
    return <ReaderClubNotFound />;
  }

  const hasLiveReaders = readers.length > 0;
  const canListen = isMember && !isOwner && activeBookId && hasLiveReaders;
  const settings = parseClubSettings(club.settings);
  const scheduleItems = parseSchedule(club.schedule);
  const extraTabs = [
    ...(isMember ? [{
      value: "recordings",
      label: "Записи эфиров",
      content: (
        <div className="space-y-4 text-sm text-muted-foreground">
          {recordingsLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем записи...
            </div>
          ) : clubRecordings.length > 0 ? (
            clubRecordings.map((recording) => {
              const canPublish = recording.status === "ready" && recording.moderationStatus === "approved" && !recording.isPublished;
              const canUnpublish = recording.status === "ready" && recording.moderationStatus === "approved" && Boolean(recording.isPublished);
              const isUpdatingPublication = publicationRecordingMutation.isPending && publicationRecordingMutation.variables?.recording.id === recording.id;
              const canListenRecording = recording.status === "ready" && recording.moderationStatus === "approved" && Boolean(recording.isPublished && recording.allowStreaming);
              const isLoadingStream = streamRecordingMutation.isPending && streamRecordingMutation.variables?.id === recording.id;
              const isPlayingThis = playingRecording?.id === recording.id;

              return (
                <div key={recording.id} className="rounded-lg border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{recording.publicTitle || recording.title || "Запись эфира"}</p>
                        <Badge variant={getRecordingBadgeVariant(recording)}>{getRecordingStatusLabel(recording)}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Создана {formatRecordingDate(recording.createdAt)}</p>
                      {recording.moderationNotes ? <p className="text-xs text-muted-foreground">Комментарий модерации: {recording.moderationNotes}</p> : null}
                      {isPlayingThis ? <audio controls src={playingRecording.url} className="mt-2 w-full max-w-md" /> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {!isOwner && canListenRecording ? (
                        <Button type="button" size="sm" onClick={() => streamRecordingMutation.mutate(recording)} disabled={isLoadingStream}>
                          {isLoadingStream ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                          {isPlayingThis ? "Обновить плеер" : "Слушать запись"}
                        </Button>
                      ) : null}
                      {isOwner && (canPublish || canUnpublish) ? (
                        <Button type="button" variant={canUnpublish ? "outline" : "default"} size="sm" onClick={() => publicationRecordingMutation.mutate({ recording, isPublished: canPublish })} disabled={isUpdatingPublication}>
                          {isUpdatingPublication ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {canUnpublish ? "Снять с публикации" : "Опубликовать"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p>{isOwner ? "Здесь появятся записи эфиров после завершения Studio и административной модерации." : "Опубликованные записи эфиров появятся здесь после модерации и публикации чтецом."}</p>
          )}
        </div>
      ),
    }] : []),
    ...(isOwner ? [{
      value: "analytics",
      label: "Аналитика",
      content: (
        <div className="space-y-4 text-sm text-muted-foreground">
          {analyticsLoading ? (
            <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Загружаем статистику...</div>
          ) : analyticsSummary && analyticsSummary.totalSessions > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Эфиры</p><p className="mt-1 text-2xl font-semibold text-foreground">{formatMetricValue(analyticsSummary.totalSessions)}</p></div>
              <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Слушатели</p><p className="mt-1 text-2xl font-semibold text-foreground">{formatMetricValue(analyticsSummary.totalListeners)}</p></div>
              <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Среднее</p><p className="mt-1 text-2xl font-semibold text-foreground">{formatMetricValue(analyticsSummary.averageListeners)}</p></div>
              <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Реакции</p><p className="mt-1 text-2xl font-semibold text-foreground">{formatMetricValue(analyticsSummary.totalReactions)}</p></div>
              <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Вопросы</p><p className="mt-1 text-2xl font-semibold text-foreground">{formatMetricValue(analyticsSummary.totalQuestions)}</p></div>
              <div className="rounded-lg border bg-muted/20 p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Качество</p><p className="mt-1 text-2xl font-semibold text-foreground">{formatMetricValue(analyticsSummary.averageQuality)}%</p></div>
            </div>
          ) : <p>Статистика появится после завершения первого эфира.</p>}
          {analyticsRatings.length > 0 ? <p className="text-xs">Оценок слушателей: {analyticsRatings.length}</p> : null}
          {analyticsQuestions.length > 0 ? <p className="text-xs">Вопросов и комментариев: {analyticsQuestions.length}</p> : null}
        </div>
      ),
    }] : []),
  ];

  const handleJoinRequestDecision = async (memberId: string, action: "approve" | "reject") => {
    try {
      await apiRequest(`/api/dm/reader-clubs/${clubId}/join-requests/${memberId}/${action}`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["club-members", clubId] });
      await queryClient.invalidateQueries({ queryKey: ["club", clubId] });
      toast({
        title: action === "approve" ? "Заявка одобрена" : "Заявка отклонена",
        description: action === "approve" ? "Пользователь стал участником клуба." : "Пользователь получит уведомление в личных сообщениях.",
      });
    } catch (error) {
      toast({
        title: "Не удалось обработать заявку",
        description: error instanceof Error ? error.message : "Попробуйте ещё раз",
        variant: "destructive",
      });
    }
  };

  return (
    <MainLayout>
      <div className={cn("transition-[filter] duration-300", listeningState && "blur-sm pointer-events-none select-none")}>
        <section className="relative overflow-hidden border-b bg-primary text-primary-foreground">
          <img src={getClubCoverUrl(club.coverImage)} alt={club.title} className="absolute inset-0 h-full w-full object-cover" />
          <div className="container relative px-4 py-6 sm:px-6 md:px-12 md:py-10">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/clubs")}
                className="text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Назад к клубам
              </Button>
              {isOwner ? (
                <div className="flex flex-wrap items-center gap-2">
                  <InviteMemberModal clubId={clubId} clubTitle={club.title} />
                  <ClubSettingsModal club={club} />
                </div>
              ) : null}
            </div>

            <div className="max-w-4xl space-y-4">
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge className="border-white/20 bg-white/15 text-primary-foreground hover:bg-white/20">
                    <Mic2 className="mr-1 h-3.5 w-3.5" />
                    Клуб чтецов
                  </Badge>
                  <Badge className="border-white/20 bg-white/15 text-primary-foreground hover:bg-white/20">
                    <Lock className="mr-1 h-3.5 w-3.5" />
                    Закрытый
                  </Badge>
                  {hasLiveReaders ? (
                    <Badge className="border-emerald-300/30 bg-emerald-400/20 text-emerald-50 hover:bg-emerald-400/25">
                      <Radio className="mr-1 h-3.5 w-3.5" />
                      Эфир идёт
                    </Badge>
                  ) : null}
                </div>

                <div>
                  <h1 className="font-serif text-3xl font-bold sm:text-4xl md:text-5xl">{club.title}</h1>
                  {club.description ? (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-primary-foreground/80 sm:text-base">
                      {club.description}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary-foreground/80">
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    {club.memberCount || members.length}/{club.maxMembers} слушателей
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    Создан {new Date(club.createdAt).toLocaleDateString("ru-RU")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <main className="container grid grid-cols-1 gap-4 px-4 py-6 sm:gap-6 sm:px-6 md:px-12 md:py-8 lg:grid-cols-3 lg:gap-8 xl:gap-12">
          <aside className="order-1 space-y-6 lg:col-span-1 lg:space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Текущая книга
                </CardTitle>
              </CardHeader>
              <CardContent>
                {club.book ? (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="h-28 w-20 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm">
                        {club.book.coverUrl ? (
                          <img src={club.book.coverUrl} alt={club.book.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <BookOpen className="h-7 w-7 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <h2 className="font-semibold leading-tight">{club.book.title}</h2>
                        <p className="text-sm text-muted-foreground">{club.book.author}</p>
                        {club.book.description ? (
                          <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">{club.book.description}</p>
                        ) : null}
                      </div>
                    </div>

                    {isOwner ? (
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                        <Button className="w-full" onClick={() => setLocation(`/clubs/${clubId}/books/${club.book?.id}/read`)}>
                          <Mic2 className="mr-2 h-4 w-4" />
                          Читать в Studio
                        </Button>
                        <VoxLibrisUpload
                          defaultContext="club"
                          clubId={clubId}
                          buttonText="Заменить книгу"
                          buttonVariant="outline"
                          onSuccess={() => globalThis.location.reload()}
                        />
                      </div>
                    ) : (
                      <Button className="w-full" disabled={!canListen} onClick={() => setLiveModalOpen(true)}>
                        <Play className="mr-2 h-4 w-4" />
                        {hasLiveReaders ? "Слушать эфир" : "Эфир пока не идёт"}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 text-sm text-muted-foreground">
                    <p>
                      {isOwner ? "Загрузите книгу, чтобы начать эфир." : "Чтец ещё не выбрал книгу для эфира."}
                    </p>
                    {isOwner ? (
                      <VoxLibrisUpload
                        defaultContext="club"
                        clubId={clubId}
                        buttonText="Загрузить книгу"
                        onSuccess={() => globalThis.location.reload()}
                      />
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Headphones className="h-5 w-5 text-primary" />
                  Участники
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {membersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Загружаем участников...
                  </div>
                ) : members.length > 0 ? (
                  members.slice(0, 8).map((member) => {
                    const isMuted = member.mutedUntil ? new Date(member.mutedUntil).getTime() > Date.now() : false;
                    const isDeactivated = member.isActive === false || (member.deactivatedUntil ? new Date(member.deactivatedUntil).getTime() > Date.now() : false);
                    const canModerateMember = isOwner && member.role !== "owner";

                    return (
                    <div key={member.id} className="flex items-center gap-3">
                      <Link href={`/profile/${member.id}`} aria-label={`Открыть профиль ${member.displayName || member.username}`}>
                        <Avatar className="h-8 w-8 cursor-pointer transition-opacity hover:opacity-80">
                          <AvatarImage src={member.avatar ?? undefined} />
                          <AvatarFallback>{member.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{member.displayName || member.username}</p>
                        <p className="text-xs text-muted-foreground">{member.role === "owner" ? "Чтец" : "Слушатель"}</p>
                      </div>
                      <Badge variant={member.role === "owner" ? "default" : member.isActive === false ? "outline" : "secondary"} className="shrink-0 text-[10px]">
                        {member.role === "owner" ? "Чтец" : member.isActive === false ? "Ожидает" : "Слушатель"}
                      </Badge>
                      {isMuted ? <Badge variant="secondary" className="shrink-0 text-[10px]" title={getRestrictionInfo(member.mutedUntil, member.restrictionReason)}>Без права писать</Badge> : null}
                      {isDeactivated ? <Badge variant="destructive" className="shrink-0 text-[10px]" title={getRestrictionInfo(member.deactivatedUntil, member.restrictionReason)}>Доступ ограничен</Badge> : null}
                      {isOwner && member.isActive === false ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            title="Одобрить заявку"
                            aria-label="Одобрить заявку"
                            onClick={() => void handleJoinRequestDecision(member.id, "approve")}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            title="Отклонить заявку"
                            aria-label="Отклонить заявку"
                            onClick={() => void handleJoinRequestDecision(member.id, "reject")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : null}
                      {canModerateMember ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="justify-center"
                              title={isMuted ? "Разрешить писать" : "Запретить писать"}
                              aria-label={isMuted ? "Разрешить писать" : "Запретить писать"}
                              onClick={() => isMuted ? moderateMember.mutate({ clubId, userId: member.id, action: "unmute" }) : setModerationTarget({ member, action: "mute" })}
                            >
                              {isMuted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="justify-center"
                              title={isDeactivated ? "Вернуть доступ" : "Ограничить доступ"}
                              aria-label={isDeactivated ? "Вернуть доступ" : "Ограничить доступ"}
                              onClick={() => isDeactivated ? moderateMember.mutate({ clubId, userId: member.id, action: "reactivate" }) : setModerationTarget({ member, action: "deactivate" })}
                            >
                              {isDeactivated ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="justify-center text-destructive"
                              title="Исключить из клуба"
                              aria-label="Исключить из клуба"
                              onClick={() => handleRemoveMember(member)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Список слушателей доступен участникам клуба.
                  </p>
                )}
              </CardContent>
            </Card>

            {isOwner ? <InvitationsList clubId={clubId} isOwner={isOwner} /> : null}
          </aside>

          <section className="order-2 space-y-6 lg:col-span-2">
            <ClubContentTabs
              clubId={clubId}
              isMember={isMember}
              isOwner={isOwner}
              currentUserId={user?.id || ""}
              settings={settings}
              scheduleItems={scheduleItems}
              activeBookId={club.bookId}
              setLocation={setLocation}
              showLibrary={isOwner}
              extraTabs={extraTabs}
            />

            {isAuthenticated && isMember ? (
              <ChatWidget clubId={club.id} mobileBottomOffsetPx={88} mobileTopOffsetPx={76} />
            ) : null}
          </section>
        </main>

        {isAuthenticated && isMember && activeBookId ? (
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
        ) : null}
      </div>

      {isAuthenticated && isMember && activeBookId ? (
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
      ) : null}

      {listeningState ? (
        <ListenerOverlay
          reader={listeningState.reader}
          bookTitle={listeningState.bookTitle}
          bookAuthor={listeningState.bookAuthor}
          coverUrl={listeningState.coverUrl}
          isPaused={Boolean(listeningState.reader.isPaused)}
          onStop={() => stopListening()}
          onStreamEnded={() => stopListening({ stopPlayback: false })}
        />
      ) : null}

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
                <Label htmlFor="reader-moderation-date">Дата окончания</Label>
                <NativePickerInput id="reader-moderation-date" type="date" value={moderationDate} onChange={(event) => setModerationDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reader-moderation-time">Время окончания</Label>
                <NativePickerInput id="reader-moderation-time" type="time" value={moderationTime} onChange={(event) => setModerationTime(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reader-moderation-reason">Причина</Label>
              <Textarea id="reader-moderation-reason" value={moderationReason} onChange={(event) => setModerationReason(event.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModerationTarget(null)}>Отмена</Button>
            <Button onClick={submitModeration}>Применить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
