import { Link, useLocation } from "wouter";
import {
  Users,
  BookOpen,
  Users2,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Shield,
  FileText,
  TrendingUp,
  Home,
  Target
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

interface AdminLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Панель управления", href: "/admin", icon: BarChart3 },
  { name: "Пользователи", href: "/admin/users", icon: Users },
  { name: "Книги", href: "/admin/books", icon: BookOpen },
  { name: "Клубы", href: "/admin/clubs", icon: Users2 },
  { name: "Отчёты", href: "/admin/reports", icon: FileText },
  { name: "Аналитика", href: "/admin/analytics", icon: TrendingUp },
  { name: "KPI Метрики", href: "/admin/kpi", icon: Target },
  { name: "Настройки", href: "/admin/settings", icon: Settings },
];

function AdminSidebar({ mobile = false }: { mobile?: boolean }) {
  const [location, setLocation] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!isAuthenticated && isLoggingOut) {
      setIsLoggingOut(false);
    }
  }, [isAuthenticated, isLoggingOut]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    await logout();
    setLocation("/");
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="font-semibold text-lg">Админ-панель</h1>
            <p className="text-xs text-muted-foreground">VoxLibris</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {navigation.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start gap-3",
                  isActive && "bg-blue-50 text-blue-700 border-blue-200"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.name}
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className="border-t px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-sm font-medium">
              {user?.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{user?.username}</p>
            <Badge variant="outline" className="text-xs">
              {user?.role === 'admin' ? 'Администратор' : 'Модератор'}
            </Badge>
          </div>
        </div>
        
        <div className="space-y-1">
          <Link href="/">
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
              <Home className="h-4 w-4" />
              На сайт
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="w-full justify-start gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Выходим..." : "Выйти"}
          </Button>
        </div>
      </div>
    </div>
  );

  if (mobile) {
    return sidebarContent;
  }

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="flex flex-col flex-grow bg-white border-r shadow-sm">
        {sidebarContent}
      </div>
    </aside>
  );
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Проверка прав доступа
  if (!isAuthenticated || !user || !['admin', 'moderator'].includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Доступ запрещен
          </h1>
          <p className="text-gray-600 mb-6">
            У вас нет прав для доступа к админ-панели
          </p>
          <Button onClick={() => setLocation("/")}>
            Вернуться на главную
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <AdminSidebar />

      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-64">
                <AdminSidebar mobile />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              <span className="font-semibold">Админ-панель</span>
            </div>
          </div>
          
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-sm">
              {user?.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>

      {/* Main Content */}
      <div className="md:pl-64">
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
