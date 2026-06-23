import { Link } from "wouter";
import { BookOpen, Compass, Home, LibraryBig, Search } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const links = [
  { href: "/", label: "На главную", icon: Home },
  { href: "/catalog", label: "Каталог клубов", icon: Compass },
  { href: "/library", label: "Библиотека", icon: LibraryBig },
  { href: "/readers", label: "Чтецы", icon: BookOpen },
];

export default function NotFound() {
  return (
    <MainLayout>
      <div className="container mx-auto flex min-h-[58dvh] items-center justify-center px-[4vw] py-[2vh]">
        <Card className="relative w-full max-w-[92vw] overflow-hidden border-primary/10 bg-card/95 shadow-xl sm:max-w-xl">
          <div className="absolute -right-14 -top-14 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
          <div className="absolute -bottom-16 -left-16 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />

          <CardContent className="relative space-y-5 p-5 text-center sm:p-7">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Search className="h-6 w-6" />
            </div>

            <div className="space-y-2">
              <p className="font-serif text-5xl font-bold leading-none text-primary">404</p>
              <h1 className="font-serif text-2xl font-bold text-foreground sm:text-3xl">Страница потерялась между главами</h1>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Такой страницы в VoxLibris нет или ссылка устарела. Можно вернуться к чтению, клубам или найти новый голос для эфира.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {links.map(({ href, label, icon: Icon }) => (
                <Button key={href} variant="outline" className="h-10 justify-start gap-3" asChild>
                  <Link href={href}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
