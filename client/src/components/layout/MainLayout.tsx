import { Link, useLocation } from "wouter";
import { Search, User, Menu, Settings, Construction } from "lucide-react";
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
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (showComingSoon) {
      const timer = setTimeout(() => {
        setShowComingSoon(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showComingSoon]);

  const handlePlaceholderLink = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setShowComingSoon(true);
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Успешный выход",
        description: "Вы вышли из системы",
      });
      setLocation("/");
    } catch {
      toast({
        title: "Ошибка выхода",
        description: "Не удалось выйти из системы",
        variant: "destructive",
      });
    }
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
                    <Link href="/readers" className="text-lg font-medium hover:text-primary transition-colors">
                      Топ Чтецов
                    </Link>
                    <Link href="/library" className="text-lg font-medium hover:text-primary transition-colors">
                      Моя Библиотека
                    </Link>
                    <Link href="/clubs" className="text-lg font-medium hover:text-primary transition-colors">
                      Мои Клубы
                    </Link>
                    <Link href="/reader-studio" className="text-lg font-medium hover:text-primary transition-colors text-accent">
                      Студия Чтеца
                    </Link>
                    <Link href="/pricing" className="text-lg font-medium hover:text-primary transition-colors">
                      Тарифы
                    </Link>
                    <Link href="/become-reader" className="text-lg font-medium hover:text-primary transition-colors">
                      Стать чтецом
                    </Link>
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
              {isAuthenticated && (
                <Link href="/reader-studio">
                  <Button variant="ghost" size="sm" className="hidden sm:flex">
                    Начать чтение
                  </Button>
                </Link>
              )}
              
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
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/profile")}>
                      Профиль
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/library")}>
                      Моя библиотека
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLocation("/clubs")}>
                      Мои клубы
                    </DropdownMenuItem>
                    {(user?.role === 'admin' || user?.role === 'moderator') && (
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
                    <DropdownMenuItem onClick={handleLogout}>
                      Выйти
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
      <main className="flex-1">{children}</main>
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
              <li><a href="#" onClick={handlePlaceholderLink} className="hover:text-primary cursor-pointer">Правила</a></li>
              <li><Link href="/become-reader" className="hover:text-primary">Стать чтецом</Link></li>
              <li><a href="#" onClick={handlePlaceholderLink} className="hover:text-primary cursor-pointer">Помощь</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-foreground mb-4">Легал</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#" onClick={handlePlaceholderLink} className="hover:text-primary cursor-pointer">Приватность</a></li>
              <li><a href="#" onClick={handlePlaceholderLink} className="hover:text-primary cursor-pointer">Условия</a></li>
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
    </div>
  );
}
