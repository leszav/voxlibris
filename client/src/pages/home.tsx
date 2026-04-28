import * as React from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { ClubCard } from "@/components/ui/club-card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";
import { ReadingDreamIllustration } from "@/components/illustrations/reading-dream";
import { Link } from "wouter";
import { useCatalogClubs } from "@/hooks/use-clubs";
import { useGridColumns } from "@/hooks/use-grid-columns";
import heroImageAvif from "@assets/generated_images/cozy_library_atmosphere_with_warm_lighting.avif";
import heroImagePng from "@assets/generated_images/cozy_library_atmosphere_with_warm_lighting.png";
import heroImageWebp from "@assets/generated_images/cozy_library_atmosphere_with_warm_lighting.webp";


export default function Home() {
  // Главная: grid md:grid-cols-2 lg:grid-cols-3 → breakpoints md=768, lg=1024
  const cols = useGridColumns({ sm: 768, lg: 1024 });
  // Показываем 2 строки, кратно cols
  const { data: clubs, isLoading, error } = useCatalogClubs(cols * 2);

  const featuredClubs = clubs || [];

  return (
    <MainLayout>
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
    </MainLayout>
  );
}
