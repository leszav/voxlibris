import { Link, useLocation } from "wouter";
import { Search, User, Menu, Settings, Construction, LogOut } from "lucide-react";
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
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { isImpersonating, getImpersonatedUsername, exitImpersonation } from "@/lib/token-store";
import { GuestStatusBanner } from "@/components/guest/GuestStatusBanner";

export function MainLayout({ children }: { readonly children: React.ReactNode }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, logout, refetchUser } = useAuth();
  const queryClient = useQueryClient();
  const [impersonating, setImpersonating] = useState(isImpersonating());
  const [impersonatedUser, setImpersonatedUser] = useState(getImpersonatedUsername());

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

  const handlePlaceholderLink = (e: React.MouseEvent<HTMLAnchorElement> | React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setShowComingSoon(true);
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
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Найти клуб, книгу..."
                  className="pl-9 bg-secondary/50 border-transparent focus:border-primary focus:bg-background transition-all rounded-full h-9 w-full"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              
              {isAuthenticated ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="icon" className="rounded-full">
                      <User className="h-5 w-5" />
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
                    <DropdownMenuItem onClick={() => setLocation("/profile")}>
                      Профиль
                      {impersonating && (
                        <span className="ml-2 text-muted-foreground text-sm">
                          (как {impersonatedUser})
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/library")}>
                      Моя библиотека
                      {impersonating && (
                        <span className="ml-2 text-muted-foreground text-sm">
                          (как {impersonatedUser})
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/clubs")}>
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
                    {(user?.role === 'admin' || user?.role === 'moderator') && !impersonating && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setLocation("/admin")}
                          className="text-orange-600 hover:text-orange-700"
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          Административная панель
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleLogout();
                      }}
                      disabled={isLoggingOut}
                    >
                      {isLoggingOut ? "Выходим..." : "Выйти"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
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
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <GuestStatusBanner />
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
