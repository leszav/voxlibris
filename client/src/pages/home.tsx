import * as React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { ClubCard } from "@/components/ui/club-card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, ArrowUp, Sparkles, Loader2, Mic2, Star, Users, Radio } from "lucide-react";
import { ReadingDreamIllustration } from "@/components/illustrations/reading-dream";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCatalogClubs, useCatalogClubsByType, useLandingReaderClubsStatus, useLandingTopReadersStatus, type PublicCatalogClub } from "@/hooks/use-clubs";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { apiRequest } from "@/lib/queryClient";
import heroImageAvif from "@assets/generated_images/cozy_library_atmosphere_with_warm_lighting.avif";
import heroImagePng from "@assets/generated_images/cozy_library_atmosphere_with_warm_lighting.png";
import heroImageWebp from "@assets/generated_images/cozy_library_atmosphere_with_warm_lighting.webp";

interface LandingReaderProfile {
  id: string;
  userId: string;
  displayName: string | null;
  avatar: string | null;
  coverImage: string | null;
  bio: string | null;
  readerRating: number;
  totalReadingSessions: number;
  totalListeners: number;
  followersCount: number;
}

interface TopReadersResponse {
  readers: LandingReaderProfile[];
}

interface PaymentSummary {
  productTitle: string;
  amountRub: number;
  period: "one_time" | "week" | "month" | "quarter" | "year";
  receiptUrl: string | null;
  subscriptionModalDismissed: boolean;
}

function getReaderName(reader: LandingReaderProfile): string {
  return reader.displayName || "Чтец VoxLibris";
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ЧТ";
}

function formatReaderRating(value: number): string {
  return value > 0 ? (value / 100).toFixed(1) : "—";
}

function periodLabel(period: PaymentSummary["period"]): string {
  return { one_time: "разово", week: "неделя", month: "месяц", quarter: "квартал", year: "год" }[period];
}

export default function Home() {
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  const params = new URLSearchParams(window.location.search);
  const subscriptionStatus = params.get("subscription");
  const paymentId = params.get("paymentId");
  const fallbackReceiptUrl = params.get("receiptUrl");
  const [subscriptionModalOpen, setSubscriptionModalOpen] = React.useState(false);
  // Главная: grid md:grid-cols-2 lg:grid-cols-3 → breakpoints md=768, lg=1024
  const cols = useGridColumns({ sm: 768, lg: 1024 });
  // Показываем 2 строки, кратно cols
  const { data: clubs, isLoading, error } = useCatalogClubs(cols * 2);
  const { data: readerClubsStatus } = useLandingReaderClubsStatus();
  const readerClubsEnabled = readerClubsStatus?.enabled === true;
  const { data: readerClubs = [], isLoading: readerClubsLoading, error: readerClubsError } = useCatalogClubsByType("reader-led", 6);
  const { data: topReadersStatus } = useLandingTopReadersStatus();
  const topReadersEnabled = topReadersStatus?.enabled === true;
  const { data: topReaders = [], isLoading: topReadersLoading, error: topReadersError } = useQuery({
    queryKey: ["landing-top-readers", 6],
    queryFn: async () => {
      const response = await apiRequest<TopReadersResponse>("/api/readers/top?limit=6");
      return response.readers;
    },
    staleTime: 1000 * 60 * 5,
  });
  const { data: paymentSummary } = useQuery<PaymentSummary>({
    queryKey: ["commerce-payment-summary", paymentId],
    queryFn: () => apiRequest<PaymentSummary>(`/api/commerce/payments/${encodeURIComponent(paymentId ?? "")}/summary`),
    enabled: (subscriptionStatus === "success" || subscriptionStatus === "failed") && Boolean(paymentId),
  });
  const dismissSubscriptionModal = useMutation({
    mutationFn: () => apiRequest(`/api/commerce/payments/${encodeURIComponent(paymentId ?? "")}/dismiss-subscription-modal`, { method: "POST" }),
  });

  const featuredClubs = clubs || [];

  React.useEffect(() => {
    const updateScrollTopVisibility = () => {
      const scrollBottom = window.scrollY + window.innerHeight;
      const triggerPoint = document.documentElement.scrollHeight - window.innerHeight * 0.75;
      setShowScrollTop(scrollBottom >= triggerPoint);
    };

    updateScrollTopVisibility();
    window.addEventListener("scroll", updateScrollTopVisibility, { passive: true });
    window.addEventListener("resize", updateScrollTopVisibility);

    return () => {
      window.removeEventListener("scroll", updateScrollTopVisibility);
      window.removeEventListener("resize", updateScrollTopVisibility);
    };
  }, []);

  React.useEffect(() => {
    if (subscriptionStatus !== "success" && subscriptionStatus !== "failed") return;
    if (!paymentId) {
      setSubscriptionModalOpen(true);
      return;
    }
    if (paymentSummary && !paymentSummary.subscriptionModalDismissed) setSubscriptionModalOpen(true);
    if (paymentSummary?.subscriptionModalDismissed) window.location.assign("/");
  }, [paymentId, paymentSummary, subscriptionStatus]);

  function handleSubscriptionModalOpenChange(open: boolean) {
    setSubscriptionModalOpen(open);
    if (!open) {
      if (paymentId && !paymentSummary?.subscriptionModalDismissed) {
        dismissSubscriptionModal.mutate(undefined, { onSettled: () => window.location.assign("/") });
        return;
      }
      window.location.assign("/");
    }
  }

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const receiptUrl = paymentSummary?.receiptUrl ?? fallbackReceiptUrl;

  return (
    <MainLayout>
      <Dialog open={subscriptionModalOpen} onOpenChange={handleSubscriptionModalOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{subscriptionStatus === "success" ? "Подписка успешно оформлена" : "Оплата не завершена"}</DialogTitle>
            <DialogDescription>
              {subscriptionStatus === "success"
                ? "Доступ активирован. Подробности подписки отправлены на вашу электронную почту."
                : "Платёж был отменён или не обработан. Подписка не активирована."}
            </DialogDescription>
          </DialogHeader>
          {subscriptionStatus === "success" && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm">
              <div><span className="text-muted-foreground">Тариф:</span> {paymentSummary?.productTitle ?? "Подписка VoxLibris"}</div>
              {paymentSummary && <div><span className="text-muted-foreground">Стоимость:</span> {paymentSummary.amountRub.toLocaleString("ru-RU")} ₽ / {periodLabel(paymentSummary.period)}</div>}
              {receiptUrl && <div><a className="text-primary underline" href={receiptUrl} target="_blank" rel="noreferrer">Открыть фейковый чек</a></div>}
              <div className="text-muted-foreground">Отказаться от подписки можно в профиле или через поддержку VoxLibris.</div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => handleSubscriptionModalOpenChange(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Hero Section */}
      <section className="relative flex min-h-[31rem] w-full items-center justify-center overflow-hidden py-16 sm:min-h-[36rem] md:h-[600px] md:py-0">
        <div className="absolute inset-0 z-0">
          <picture>
            <source srcSet={heroImageAvif} type="image/avif" />
            <source srcSet={heroImageWebp} type="image/webp" />
            <img
              src={heroImagePng}
              alt="Уютный уголок для чтения"
              className="w-full h-full object-cover"
              width={1408}
              height={768}
              sizes="100vw"
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
          </picture>
          <div className="absolute inset-0 bg-primary/40 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>

        <div className="relative z-10 container mx-auto max-w-4xl space-y-6 px-4 text-center animate-in fade-in slide-in-from-bottom-8 duration-1000 sm:px-6 md:space-y-8 md:px-12">
          <Badge variant="secondary" className="mx-auto w-fit px-4 py-1.5 text-xs backdrop-blur-sm bg-white/10 text-white border-white/20 sm:text-sm">
            <Sparkles className="w-3.5 h-3.5 mr-2 text-accent" />
            Социальное чтение по-новому
          </Badge>

          <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-white drop-shadow-lg sm:text-5xl md:text-7xl">
            Читаем Вместе,<br />
            <span className="text-accent italic">Вслух и Живьем.</span>
          </h1>
          
          <p className="mx-auto max-w-2xl text-base font-light leading-relaxed text-white/90 drop-shadow-md sm:text-lg md:text-xl">
            Вступайте в эксклюзивные книжные клубы, слушайте талантливых чтецов в прямом эфире и делитесь впечатлениями с сообществом.
          </p>
          
          <div className="flex flex-col items-stretch justify-center gap-3 pt-2 sm:flex-row sm:items-center sm:gap-4 sm:pt-4">
            <Link href="/catalog">
              <Button size="lg" className="h-12 w-full rounded-full px-8 text-base font-medium shadow-xl transition-transform hover:scale-105 sm:w-auto">
                Найти клуб
              </Button>
            </Link>
            <Link href="/library">
              <Button size="lg" variant="outline" className="h-12 w-full rounded-full border-2 bg-white/5 px-8 text-base font-medium backdrop-blur-sm transition-transform hover:scale-105 hover:bg-white/10 sm:w-auto">
                В библиотеку
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Clubs */}
      <section className="container px-4 py-12 sm:px-6 md:px-12 md:py-20">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-10">
          <div>
            <h2 className="text-3xl font-serif font-bold text-primary mb-2">Популярные Клубы</h2>
            <p className="text-muted-foreground">Самые активные сообщества прямо сейчас.</p>
          </div>
          <Link href="/catalog">
            <Button variant="ghost" className="group w-full justify-between sm:w-auto sm:justify-center">
              Все клубы <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        </div>

        {/* Состояние загрузки */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Загружаем популярные клубы...</span>
          </div>
        )}

        {/* Состояние ошибки */}
        {error && (
          <div className="text-center py-12">
            <div className="text-red-600 mb-2">Не удалось загрузить клубы</div>
            <div className="text-sm text-muted-foreground">Попробуйте обновить страницу позже</div>
          </div>
        )}

        {/* Список клубов */}
        {!isLoading && !error && (
          <div className="rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm sm:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 sm:gap-6">
            {featuredClubs.map((club) => (
              <ClubCard
                key={club.id}
                id={club.id}
                title={club.title}
                bookTitle={club.bookTitle ?? undefined}
                author={club.author ?? undefined}
                coverUrl={club.coverImage ?? undefined}
                bookCoverUrl={club.bookCoverUrl ?? undefined}
                description={club.description ?? undefined}
                members={club.memberCount}
                maxMembers={club.maxMembers}
                isLive={club.isLive}
                isPrivate={club.isPrivate}
                type={club.type as "standard" | "premium" | "reader-led" | "reading_club"}
                tags={club.tags}
                readerJoinRequestsEnabled={club.readerJoinRequestsEnabled}
              />
            ))}
            
            {/* Если клубов пока нет */}
            {featuredClubs.length === 0 && (
              <div className="col-span-full text-center py-12">
                <div className="text-muted-foreground mb-4">
                  Популярных клубов пока нет
                </div>
                <Link href="/catalog">
                  <Button variant="outline">
                    Посмотреть все клубы
                  </Button>
                </Link>
              </div>
            )}
            </div>
          </div>
        )}
      </section>

      {readerClubsEnabled ? (
        <section className="container px-4 pb-12 sm:px-6 md:px-12 md:pb-20">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-10">
            <div>
              <Badge variant="secondary" className="mb-3 w-fit bg-accent/10 text-accent">
                <Mic2 className="mr-2 h-3.5 w-3.5" />
                Голосовые клубы
              </Badge>
              <h2 className="mb-2 font-serif text-3xl font-bold text-primary">Клубы чтецов</h2>
              <p className="text-muted-foreground">Слушайте книги в живом исполнении и присоединяйтесь к клубам любимых голосов.</p>
            </div>
            <Link href="/catalog">
              <Button variant="ghost" className="group w-full justify-between sm:w-auto sm:justify-center">
                Все клубы <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          {readerClubsLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Загружаем клубы чтецов...</span>
            </div>
          )}

          {readerClubsError && (
            <div className="py-12 text-center">
              <div className="mb-2 text-red-600">Не удалось загрузить клубы чтецов</div>
              <div className="text-sm text-muted-foreground">Попробуйте обновить страницу позже</div>
            </div>
          )}

          {!readerClubsLoading && !readerClubsError && readerClubs.length > 0 ? (
            <div className="rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {readerClubs.slice(0, 6).map((club) => (
                  <HomeClubCard key={club.id} club={club} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {topReadersEnabled ? (
        <section className="container px-4 pb-12 sm:px-6 md:px-12 md:pb-20">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-10">
            <div>
              <Badge variant="secondary" className="mb-3 w-fit bg-amber-500/10 text-amber-600">
                <Star className="mr-2 h-3.5 w-3.5" />
                Рейтинг голосов
              </Badge>
              <h2 className="mb-2 font-serif text-3xl font-bold text-primary">Лучшие чтецы</h2>
              <p className="text-muted-foreground">Голоса VoxLibris, которые собирают слушателей вокруг живого чтения.</p>
            </div>
            <Link href="/readers">
              <Button variant="ghost" className="group w-full justify-between sm:w-auto sm:justify-center">
                Весь рейтинг <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </div>

          {topReadersLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Загружаем рейтинг чтецов...</span>
            </div>
          )}

          {topReadersError && (
            <div className="py-12 text-center">
              <div className="mb-2 text-red-600">Не удалось загрузить рейтинг чтецов</div>
              <div className="text-sm text-muted-foreground">Попробуйте обновить страницу позже</div>
            </div>
          )}

          {!topReadersLoading && !topReadersError && topReaders.length > 0 ? (
            <div className="rounded-2xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
                {topReaders.slice(0, 6).map((reader) => (
                  <HomeReaderCard key={reader.id} reader={reader} />
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* For Beginners Section */}
      <section className="bg-secondary/30 py-12 md:py-20">
        <div className="container px-4 sm:px-6 md:px-12">
          <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-primary">Как работает VoxLibris</h2>
              <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                Откройте книги с новой стороны. Хотите ли вы читать вслух для аудитории или просто слушать — здесь найдется место для каждого.
              </p>
              
              <div className="space-y-4 pt-4">
                {[
                  { id: "join-club", title: "Вступите в клуб", desc: "Выберите жанр и найдите группу по душе." },
                  { id: "listen-live", title: "Слушайте в эфире", desc: "Подключайтесь к живым чтениям от лучших чтецов." },
                  { id: "discuss", title: "Обсуждайте", desc: "Общайтесь в чате и делитесь мыслями по ходу сюжета." }
                ].map((item, i) => (
                  <div key={item.id} className="flex gap-3 sm:gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-background font-serif font-bold text-accent shadow-sm sm:h-10 sm:w-10">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-square rounded-2xl border bg-card p-5 shadow-2xl transition-transform duration-500 md:rotate-3 md:p-8 md:hover:rotate-0">
                <div className="h-full w-full rounded-xl bg-gradient-to-br from-primary/5 via-accent/5 to-secondary/10 flex items-center justify-center border border-dashed border-primary/20">
                   <div className="space-y-4 p-4 text-center sm:space-y-6 sm:p-6">
                      <ReadingDreamIllustration className="mx-auto h-24 w-24 text-primary/60 sm:h-32 sm:w-32" />
                      <blockquote className="font-serif text-xl italic text-primary/80 leading-relaxed">
                        "Чтение — это окно в тысячи миров, дверь к свободе и крылья для души."
                        <footer className="block text-sm mt-2 text-primary/50">
                          — Максим Горький
                        </footer>
                      </blockquote>
                    </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      {showScrollTop && (
        <Button
          type="button"
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
          onClick={scrollToTop}
          aria-label="Наверх"
        >
          <ArrowUp className="h-5 w-5" />
        </Button>
      )}
    </MainLayout>
  );
}

function HomeClubCard({ club }: Readonly<{ club: PublicCatalogClub }>) {
  return (
    <ClubCard
      id={club.id}
      title={club.title}
      bookTitle={club.bookTitle ?? undefined}
      author={club.author ?? undefined}
      coverUrl={club.coverImage ?? undefined}
      bookCoverUrl={club.bookCoverUrl ?? undefined}
      description={club.description ?? undefined}
      members={club.memberCount}
      maxMembers={club.maxMembers}
      isLive={club.isLive}
      isPrivate={club.isPrivate}
      type={club.type as "standard" | "premium" | "reader-led" | "reading_club"}
      tags={club.tags}
      readerJoinRequestsEnabled={club.readerJoinRequestsEnabled}
    />
  );
}

function HomeReaderCard({ reader }: Readonly<{ reader: LandingReaderProfile }>) {
  const name = getReaderName(reader);
  const hasCoverImage = Boolean(reader.coverImage);

  return (
    <Card
      className="relative h-full overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg"
      style={hasCoverImage ? { backgroundImage: `url(${reader.coverImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
    >
      {hasCoverImage ? <div className="absolute inset-0 bg-background/88 backdrop-blur-[1px]" /> : null}
      <CardContent className="relative flex h-full flex-col gap-5 p-5">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 border-2 border-background shadow-sm">
            <AvatarImage src={reader.avatar ?? undefined} />
            <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-serif text-xl font-bold text-primary">{name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="font-medium text-foreground">{formatReaderRating(reader.readerRating)}</span>
              <span>•</span>
              <span>{reader.followersCount} подписчиков</span>
            </div>
          </div>
        </div>

        <p className="line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-muted-foreground">
          {reader.bio || "Чтец VoxLibris. Ведёт живые чтения и собирает слушателей вокруг книг."}
        </p>

        <div className="mt-auto grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Radio className="h-3.5 w-3.5" />
            {reader.totalReadingSessions} эфиров
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {reader.totalListeners} слушателей
          </span>
        </div>

        <Button variant="outline" className="w-full" asChild>
          <Link href={`/profile/${reader.userId}`}>Профиль чтеца</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
