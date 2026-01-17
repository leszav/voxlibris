import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClubs } from "@/hooks/use-clubs";
import { useLocation } from "wouter";
import { Loader2, Plus, Users, BookOpen, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function MyClubs() {
  const [, setLocation] = useLocation();
  const { data: clubs, isLoading, error } = useClubs();
  const { user } = useAuth();
  const { toast } = useToast();

  const handleCreateClub = () => {
    // Проверка статуса происходит на бэкенде через requireActiveUser middleware
    setLocation("/clubs/create");
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Загружаем клубы...</span>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="container py-12 px-6 md:px-12">
          <div className="text-center">
            <p className="text-destructive">Ошибка загрузки клубов</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const clubsList = Array.isArray(clubs) ? clubs : [];
  
  const myOwnedClubs = clubsList.filter(club => {
    // Проверяем, является ли текущий пользователь владельцем
    // Это будет работать когда добавим информацию о роли в ClubWithDetails
    return true; // Пока показываем все
  });

  const myMemberClubs = clubsList.filter(club => {
    // Клубы где пользователь участник, но не владелец
    return true; // Пока показываем все
  });

  return (
    <MainLayout>
      <div className="container py-8 px-4 md:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Мои клубы</h1>
            <p className="text-muted-foreground mt-2">
              Управляйте своими книжными клубами
            </p>
          </div>
          <Button onClick={handleCreateClub}>
            <Plus className="mr-2 h-4 w-4" />
            Создать клуб
          </Button>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="all">
              Все ({clubs?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="owned">
              Мои клубы
            </TabsTrigger>
            <TabsTrigger value="member">
              Участник
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="mt-6">
            {!clubs || clubs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">У вас пока нет клубов</h3>
                  <p className="text-muted-foreground text-center mb-6">
                    Создайте свой первый книжный клуб или присоединитесь к существующему
                  </p>
                  <Button onClick={handleCreateClub}>
                    <Plus className="mr-2 h-4 w-4" />
                    Создать клуб
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {clubs.map((club) => (
                  <Card
                    key={club.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setLocation(`/clubs/${club.id}`)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="line-clamp-1">{club.title}</CardTitle>
                          <CardDescription className="line-clamp-2 mt-1">
                            {club.description || "Без описания"}
                          </CardDescription>
                        </div>
                        {club.isPrivate && (
                          <Lock className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <BookOpen className="h-4 w-4" />
                          <span className="line-clamp-1">{club.book?.title || "Книга"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>{club.memberCount || 0} / {club.maxMembers}</span>
                          </div>
                          <Badge variant={club.status === 'active' ? 'default' : 'secondary'}>
                            {club.status === 'recruiting' && 'Набор'}
                            {club.status === 'active' && 'Активен'}
                            {club.status === 'completed' && 'Завершён'}
                            {club.status === 'archived' && 'Архив'}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="owned" className="mt-6">
            {myOwnedClubs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Вы не создали ни одного клуба</h3>
                  <p className="text-muted-foreground text-center mb-6">
                    Станьте организатором книжного клуба
                  </p>
                  <Button onClick={handleCreateClub}>
                    <Plus className="mr-2 h-4 w-4" />
                    Создать клуб
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myOwnedClubs.map((club) => (
                  <Card
                    key={club.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setLocation(`/clubs/${club.id}`)}
                  >
                    <CardHeader>
                      <CardTitle className="line-clamp-1">{club.title}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {club.description || "Без описания"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>{club.memberCount || 0} участников</span>
                        </div>
                        <Badge>Владелец</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="member" className="mt-6">
            {myMemberClubs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Вы не участвуете в других клубах</h3>
                  <p className="text-muted-foreground text-center">
                    Присоединяйтесь к клубам по приглашениям
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {myMemberClubs.map((club) => (
                  <Card
                    key={club.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setLocation(`/clubs/${club.id}`)}
                  >
                    <CardHeader>
                      <CardTitle className="line-clamp-1">{club.title}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {club.description || "Без описания"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          <span className="line-clamp-1">{club.book?.title}</span>
                        </div>
                        <Badge variant="secondary">Участник</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
