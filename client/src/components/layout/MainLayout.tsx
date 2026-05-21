import { Link, useLocation } from "wouter";
import { Search, User, Menu, Settings, Construction, LogOut, House, Compass, BookOpen, LayoutDashboard, LibraryBig, Users, MessageCircle } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FeedbackModal } from "@/components/ui/feedback-modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useUnreadSummary } from "@/hooks/use-notifications";
import { useSocket } from "@/hooks/use-socket";
import { isImpersonating, getImpersonatedUsername, exitImpersonation } from "@/lib/token-store";
import { GuestStatusBanner } from "@/components/guest/GuestStatusBanner";
import { PwaInstallPrompt } from "@/components/layout/PwaInstallPrompt";
import { NotificationPopover } from "@/components/layout/NotificationPopover";

interface SearchClubResult {
  id: string;
  title: string;
  description: string | null;
}

interface SearchBookResult {
  id: string;
  title: string;
  author: string;
}

interface SearchUserResult {
  id: string;
  username: string;
  status: string;
}

interface SearchFeatureResult {
  id: string;
  title: string;
  description: string;
  path: string;
  isFuture: boolean;
}

interface GlobalSearchResponse {
  query: string;
  results: {
    clubs: SearchClubResult[];
    books: SearchBookResult[];
    users: SearchUserResult[];
    features: SearchFeatureResult[];
  };
}

interface UserActionsProps {
  isAuthenticated: boolean;
  unreadSummary: { messagesUnread: number; notificationsUnread: number; totalUnread?: number } | undefined;
  onOpenMessages: () => void;
  setLocation: (path: string) => void;
  authAvatar: string | null;
  authUsername: string;
  user: { username?: string; role?: string } | null;
  impersonating: boolean;
  impersonatedUser: string | null;
  handleExitImpersonation: () => void;
  handleLogout: () => Promise<void>;
  isLoggingOut: boolean;
}

function UserActions({
  isAuthenticated,
  unreadSummary,
  onOpenMessages,
  setLocation,
  authAvatar,
  authUsername,
  user,
  impersonating,
  impersonatedUser,
  handleExitImpersonation,
  handleLogout,
  isLoggingOut,
}: Readonly<UserActionsProps>) {
  const messagesUnread = unreadSummary?.messagesUnread ?? 0;
  const notificationsUnread = unreadSummary?.notificationsUnread ?? 0;
  const bellUnread = unreadSummary?.totalUnread ?? (messagesUnread + notificationsUnread);
  const showAdminPanel = (user?.role === "admin" || user?.role === "moderator") && !impersonating;

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/auth/login")}
        >
          Войти
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={() => setLocation("/auth/register")}
        >
          Регистрация
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={onOpenMessages}
      >
        <MessageCircle className="h-5 w-5" />
        {messagesUnread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-0.5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center leading-none">
            {messagesUnread > 99 ? "99+" : messagesUnread}
          </span>
        )}
        <span className="sr-only">Сообщения</span>
      </Button>

      <NotificationPopover
        messagesUnread={messagesUnread}
        notificationsUnread={notificationsUnread}
        totalUnread={bellUnread}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="rounded-full">
            <Avatar className="h-8 w-8">
              {authAvatar && <AvatarImage src={authAvatar} alt={authUsername} />}
              <AvatarFallback className="text-xs font-medium">
                {authUsername.slice(0, 2).toUpperCase() || "VL"}
              </AvatarFallback>
            </Avatar>
            <span className="sr-only">Меню пользователя</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="font-medium">
            {user?.username}
            {impersonating && (
              <span className="ml-2 text-orange-600 text-sm">
                (как {impersonatedUser})
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/dashboard")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Личный кабинет
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/profile")}>
            <User className="mr-2 h-4 w-4" />
            Профиль
            {impersonating && (
              <span className="ml-2 text-muted-foreground text-sm">
                (как {impersonatedUser})
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/library")}>
            <LibraryBig className="mr-2 h-4 w-4" />
            Моя библиотека
            {impersonating && (
              <span className="ml-2 text-muted-foreground text-sm">
                (как {impersonatedUser})
              </span>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLocation("/clubs")}>
            <Users className="mr-2 h-4 w-4" />
            Мои клубы
            {impersonating && (
              <span className="ml-2 text-muted-foreground text-sm">
                (как {impersonatedUser})
              </span>
            )}
          </DropdownMenuItem>
          {impersonating && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleExitImpersonation}
                className="text-orange-600 hover:text-orange-700"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Выйти из профиля {impersonatedUser}
              </DropdownMenuItem>
            </>
          )}
          {(impersonating || showAdminPanel) && <DropdownMenuSeparator />}
          {showAdminPanel && (
            <DropdownMenuItem
              onClick={() => setLocation("/admin")}
              className="text-orange-600 hover:text-orange-700"
            >
              <Settings className="mr-2 h-4 w-4" />
              Административная панель
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void handleLogout();
            }}
            disabled={isLoggingOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {isLoggingOut ? "Выходим..." : "Выйти"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export function MainLayout({ children }: { readonly children: React.ReactNode }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GlobalSearchResponse["results"]>({
    clubs: [],
    books: [],
    users: [],
    features: [],
  });
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, logout, refetchUser } = useAuth();
  const queryClient = useQueryClient();
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const [impersonating, setImpersonating] = useState(isImpersonating());
  const [impersonatedUser, setImpersonatedUser] = useState(getImpersonatedUsername());
  const socket = useSocket();
  const { data: unreadSummary } = useUnreadSummary(isAuthenticated);

  // DM: присоединиться к персональной комнате при авторизации.
  // Токен передаётся автоматически через cookie (withCredentials: true) при handshake.
  // disconnect() + connect() гарантирует новый handshake с актуальным cookie после логина.
  useEffect(() => {
    if (!socket || !user) return;

    const joinDmRoom = () => {
      socket.emit("dm:join");
    };

    // Если сокет уже подключён с предыдущим handshake (без cookie) — переподключаем
    if (socket.connected) {
      socket.disconnect();
    }
    socket.connect();

    const connectHandler = () => {
      joinDmRoom();
    };

    socket.on("connect", connectHandler);

    const unreadHandler = ({ count }: { count: number }) => {
      // Инвалидируем сводку непрочитанных, чтобы бейдж обновился
      queryClient.invalidateQueries({ queryKey: ["notifications", "unread-summary"] });
      // Можно также напрямую патчить кэш для мгновенного обновления
      queryClient.setQueryData<{ success: boolean; messagesUnread: number; notificationsUnread: number; totalUnread: number }>(
        ["notifications", "unread-summary"],
        (old) => old ? { ...old, messagesUnread: count, totalUnread: (old.notificationsUnread ?? 0) + count } : old
      );
    };

    socket.on("dm:unread_count", unreadHandler);
    return () => {
      socket.off("connect", connectHandler);
      socket.off("dm:unread_count", unreadHandler);
    };
  }, [socket, user, queryClient]);


  // Отключаем сокет при выходе из системы
  useEffect(() => {
    if (!user && socket?.connected) {
      socket.disconnect();
    }
  }, [user, socket]);
  const authUsername = typeof user?.username === "string" ? user.username : "";
  const authAvatar = typeof user?.avatar === "string" ? user.avatar : null;

  const profileHref = isAuthenticated ? "/profile" : "/auth/login";
  const profileLabel = isAuthenticated ? "Профиль" : "Войти";

  const isHomeSection = location === "/";
  const isClubsSection = location === "/catalog" || location.startsWith("/clubs") || location.startsWith("/club/");
  const isLibrarySection = location.startsWith("/library") || location.startsWith("/books/") || location.startsWith("/guest/");
  const isProfileSection = location.startsWith("/profile") || location.startsWith("/auth/") || location.startsWith("/confirm-email/");
  const hideInstallPrompt = location.startsWith("/auth/")
    || location.startsWith("/confirm-email/")
    || location.startsWith("/admin")
    || location.startsWith("/guest/reader/");

  useEffect(() => {
    if (!isAuthenticated && isLoggingOut) {
      setIsLoggingOut(false);
    }
  }, [isAuthenticated, isLoggingOut]);

  useEffect(() => {
    if (showComingSoon) {
      const timer = setTimeout(() => {
        setShowComingSoon(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showComingSoon]);

  useEffect(() => {
    const trimmed = searchQuery.trim();

    if (trimmed.length < 2) {
      setSearchResults({ clubs: [], books: [], users: [], features: [] });
      setIsSearchLoading(false);
      return;
    }

    const abortController = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setIsSearchLoading(true);
        const response = await fetch(`/api/search/global?q=${encodeURIComponent(trimmed)}&limit=6`, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error("Search request failed");
        }

        const payload = await response.json() as GlobalSearchResponse;
        setSearchResults(payload.results);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Global search failed:", error);
          setSearchResults({ clubs: [], books: [], users: [], features: [] });
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      abortController.abort();
      clearTimeout(timer);
    };
  }, [searchQuery]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (searchContainerRef.current && target && !searchContainerRef.current.contains(target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  const handlePlaceholderLink = (e: React.MouseEvent<HTMLAnchorElement> | React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setShowComingSoon(true);
  };

  const handleSearchSelect = (path: string, isFuture: boolean = false) => {
    setShowSearchResults(false);
    setSearchQuery("");
    setIsSearchOpen(false);

    if (isFuture || !path) {
      setShowComingSoon(true);
      return;
    }

    setLocation(path);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    await logout();
    setLocation("/");
  };

  const handleExitImpersonation = async () => {
    exitImpersonation();
    setImpersonating(false);
    setImpersonatedUser(null);
    // Очищаем все кеши React Query, чтобы данные администратора загрузились заново
    queryClient.clear();
    await refetchUser();
    setLocation("/admin/users");
  };

  return (
    <div className="min-h-screen bg-background font-sans text-foreground flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-6 md:px-12">
          <div className="flex items-center gap-4 md:gap-8">
            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Меню</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[80%] sm:w-[350px]">
                <div className="flex flex-col gap-6 py-4">
                  <Link href="/" className="flex items-center gap-2 font-serif text-2xl font-bold text-primary">
                    <Logo className="h-8 w-8" />
                    <span>VoxLibris</span>
                  </Link>
                  <nav className="flex flex-col gap-4">
                    <Link href="/catalog" className="text-lg font-medium hover:text-primary transition-colors">
                      Клубы
                    </Link>
                    <Link href="/library" className="text-lg font-medium hover:text-primary transition-colors">
                      {impersonating ? `Моя Библиотека (как ${impersonatedUser})` : "Моя Библиотека"}
                    </Link>
                    <Link href="/clubs" className="text-lg font-medium hover:text-primary transition-colors">
                      {impersonating ? `Мои Клубы (как ${impersonatedUser})` : "Мои Клубы"}
                    </Link>
                    <Link href="/profile" className="text-lg font-medium hover:text-primary transition-colors flex items-center gap-2">
                      <User className="h-4 w-4" />
                      {impersonating ? `Профиль (как ${impersonatedUser})` : "Профиль"}
                    </Link>
                    {impersonating && (
                      <button
                        onClick={handleExitImpersonation}
                        className="text-lg font-medium hover:text-primary transition-colors flex items-center gap-2 text-orange-600"
                      >
                        <LogOut className="h-4 w-4" />
                        Выйти из профиля {impersonatedUser}
                      </button>
                    )}
                    {user?.role === "admin" && !impersonating && (
                      <Link href="/admin" className="text-lg font-medium hover:text-primary transition-colors flex items-center gap-2 text-accent">
                        <Settings className="h-4 w-4" />
                        Админка
                      </Link>
                    )}
                  </nav>
                </div>
              </SheetContent>
            </Sheet>

            <Link href="/" className="flex items-center gap-2 font-serif text-xl md:text-2xl font-bold tracking-tight text-primary hover:opacity-80 transition-opacity">
              <Logo className="h-8 w-8 hidden md:block" />
              <span>VoxLibris</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <Link href="/catalog" className="transition-colors hover:text-primary text-muted-foreground">
                Клубы
              </Link>
              <Link href="/readers" className="transition-colors hover:text-primary text-muted-foreground">
                Чтецы
              </Link>
              <Link href="/library" className="transition-colors hover:text-primary text-muted-foreground">
                Библиотека
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile Search Toggle */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="sm:hidden"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            >
              <Search className="h-5 w-5" />
            </Button>

            <div className={`absolute top-16 left-0 w-full bg-background border-b p-4 sm:static sm:block sm:w-auto sm:border-none sm:bg-transparent sm:p-0 transition-all duration-200 ${isSearchOpen ? 'block animate-in slide-in-from-top-2' : 'hidden'}`}>
              <div ref={searchContainerRef} className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Найти клуб, книгу..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  className="pl-9 bg-secondary/50 border-transparent focus:border-primary focus:bg-background transition-all rounded-full h-9 w-full"
                />

                {showSearchResults && searchQuery.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-11 z-50 max-h-[70vh] overflow-y-auto rounded-xl border bg-background shadow-lg">
                    {isSearchLoading ? (
                      <div className="p-3 text-sm text-muted-foreground">Ищем...</div>
                    ) : (
                      <div className="p-2">
                        {searchResults.clubs.length > 0 && (
                          <div className="mb-2">
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Клубы</div>
                            {searchResults.clubs.map((club) => (
                              <button
                                key={club.id}
                                type="button"
                                onClick={() => handleSearchSelect(`/clubs/${club.id}`)}
                                className="w-full rounded-lg px-2 py-2 text-left hover:bg-secondary"
                              >
                                <div className="text-sm font-medium truncate">{club.title}</div>
                                {club.description && (
                                  <div className="text-xs text-muted-foreground truncate">{club.description}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {searchResults.books.length > 0 && (
                          <div className="mb-2">
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Книги</div>
                            {searchResults.books.map((book) => (
                              <button
                                key={book.id}
                                type="button"
                                onClick={() => handleSearchSelect(`/books/${book.id}`)}
                                className="w-full rounded-lg px-2 py-2 text-left hover:bg-secondary"
                              >
                                <div className="text-sm font-medium truncate">{book.title}</div>
                                <div className="text-xs text-muted-foreground truncate">{book.author}</div>
                              </button>
                            ))}
                          </div>
                        )}

                        {searchResults.users.length > 0 && (
                          <div className="mb-2">
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Пользователи</div>
                            {searchResults.users.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleSearchSelect(`/profile/${item.id}`)}
                                className="w-full rounded-lg px-2 py-2 text-left hover:bg-secondary"
                              >
                                <div className="text-sm font-medium truncate">{item.username}</div>
                              </button>
                            ))}
                          </div>
                        )}

                        {searchResults.features.length > 0 && (
                          <div>
                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Разделы и фичи</div>
                            {searchResults.features.map((feature) => (
                              <button
                                key={feature.id}
                                type="button"
                                onClick={() => handleSearchSelect(feature.path, feature.isFuture)}
                                className="w-full rounded-lg px-2 py-2 text-left hover:bg-secondary"
                              >
                                <div className="text-sm font-medium truncate">{feature.title}</div>
                                <div className="text-xs text-muted-foreground truncate">{feature.description}</div>
                              </button>
                            ))}
                          </div>
                        )}

                        {searchResults.clubs.length === 0
                          && searchResults.books.length === 0
                          && searchResults.users.length === 0
                          && searchResults.features.length === 0 && (
                            <div className="p-2 text-sm text-muted-foreground">Ничего не найдено</div>
                          )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <UserActions
                isAuthenticated={isAuthenticated}
                unreadSummary={unreadSummary}
                onOpenMessages={() => setLocation('/dashboard?tab=messages')}
                setLocation={setLocation}
                authAvatar={authAvatar}
                authUsername={authUsername}
                user={user}
                impersonating={impersonating}
                impersonatedUser={impersonatedUser}
                handleExitImpersonation={handleExitImpersonation}
                handleLogout={handleLogout}
                isLoggingOut={isLoggingOut}
              />
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 pb-20 md:pb-0">
        <GuestStatusBanner />
        <PwaInstallPrompt hidden={hideInstallPrompt} />
        {children}
      </main>
      <footer className="border-t bg-card py-12 text-muted-foreground">
        <div className="container px-6 md:px-12 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2 font-serif text-xl font-bold text-foreground">
              <Logo className="h-6 w-6" />
              <span>VoxLibris</span>
            </div>
            <p className="text-sm leading-relaxed max-w-xs">
              Объединяем любителей книг и дарим живые истории через голосовые клубы.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4">Платформа</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/catalog" className="hover:text-primary">Все клубы</Link></li>
              <li><Link href="/readers" className="hover:text-primary">Топ чтецов</Link></li>
              <li><Link href="/pricing" className="hover:text-primary">Тарифы</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4">Сообщество</h4>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={handlePlaceholderLink} className="hover:text-primary cursor-pointer">Правила</button></li>
              <li><Link href="/become-reader" className="hover:text-primary">Стать чтецом</Link></li>
              <li><button type="button" onClick={() => setShowFeedback(true)} className="hover:text-primary cursor-pointer">Обратная связь</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4">Легал</h4>
            <ul className="space-y-2 text-sm">
              <li><button type="button" onClick={handlePlaceholderLink} className="hover:text-primary cursor-pointer">Приватность</button></li>
              <li><button type="button" onClick={handlePlaceholderLink} className="hover:text-primary cursor-pointer">Условия</button></li>
            </ul>
          </div>
        </div>
      </footer>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
      >
        <div className="grid grid-cols-4 gap-1 px-2 pt-2">
          <button
            type="button"
            onClick={() => setLocation("/")}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors ${isHomeSection ? "bg-secondary text-primary" : "text-muted-foreground"}`}
          >
            <House className="h-4 w-4" />
            <span>Главная</span>
          </button>

          <button
            type="button"
            onClick={() => setLocation("/catalog")}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors ${isClubsSection ? "bg-secondary text-primary" : "text-muted-foreground"}`}
          >
            <Compass className="h-4 w-4" />
            <span>Клубы</span>
          </button>

          <button
            type="button"
            onClick={() => setLocation("/library")}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors ${isLibrarySection ? "bg-secondary text-primary" : "text-muted-foreground"}`}
          >
            <BookOpen className="h-4 w-4" />
            <span>Чтение</span>
          </button>

          <button
            type="button"
            onClick={() => setLocation(profileHref)}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors ${isProfileSection ? "bg-secondary text-primary" : "text-muted-foreground"}`}
          >
            <User className="h-4 w-4" />
            <span>{profileLabel}</span>
          </button>
        </div>
      </nav>

      <Dialog open={showComingSoon} onOpenChange={setShowComingSoon}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Construction className="h-6 w-6 text-amber-500" />
              Функционал в разработке
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Мы работаем над этим разделом. Скоро здесь появится что-то интересное!
          </p>
        </DialogContent>
      </Dialog>

      <FeedbackModal 
        isOpen={showFeedback} 
        onClose={() => setShowFeedback(false)} 
      />
    </div>
  );
}
