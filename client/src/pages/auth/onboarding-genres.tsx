import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Sparkles, Tags } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useGenresCatalog } from '@/hooks/use-books-v2';
import { apiRequest } from '@/lib/queryClient';

type CurrentProfileResponse = {
  profile?: {
    favoriteGenres?: string | null;
  };
};

function parseFavoriteGenres(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(/[;,\n]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function OnboardingGenresPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: genresCatalog = [], isLoading: isGenresLoading } = useGenresCatalog();

  const { data: profileData } = useQuery<CurrentProfileResponse>({
    queryKey: ['/api/users/current/profile', 'onboarding-genres'],
    queryFn: () => apiRequest<CurrentProfileResponse>('/api/users/current/profile'),
    staleTime: 30_000,
  });

  const [selectedGenres, setSelectedGenres] = useState<string[]>(() =>
    parseFavoriteGenres(profileData?.profile?.favoriteGenres ?? null),
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fromProfile = parseFavoriteGenres(profileData?.profile?.favoriteGenres ?? null);
    if (fromProfile.length > 0 && selectedGenres.length === 0) {
      setSelectedGenres(fromProfile.slice(0, 8));
    }
  }, [profileData?.profile?.favoriteGenres, selectedGenres.length]);

  const groupedGenres = useMemo(() => {
    const groups = new Map<string, { key: string; title: string; items: string[] }>();

    for (const genre of genresCatalog) {
      const groupKey = genre.groupKey?.trim() || 'other';
      const title = groupKey === 'other' ? 'Другие жанры' : groupKey;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { key: groupKey, title, items: [] });
      }

      groups.get(groupKey)?.items.push(genre.label);
    }

    return Array.from(groups.values()).sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [genresCatalog]);

  const toggleGenre = (genreLabel: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genreLabel)) {
        return prev.filter((item) => item !== genreLabel);
      }

      if (prev.length >= 8) {
        toast({
          title: 'Лимит достигнут',
          description: 'Выберите до 8 жанров, чтобы рекомендации оставались точными.',
          variant: 'destructive',
        });
        return prev;
      }

      return [...prev, genreLabel];
    });
  };

  const handleContinue = async () => {
    if (selectedGenres.length === 0) {
      toast({
        title: 'Выберите хотя бы один жанр',
        description: 'Это нужно, чтобы сразу показывать релевантные рекомендации.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      await apiRequest('/api/users/current/profile', {
        method: 'PUT',
        body: JSON.stringify({
          favoriteGenres: selectedGenres,
        }),
      });

      toast({
        title: 'Готово',
        description: 'Жанры сохранены, рекомендации уже адаптируются под ваш вкус.',
      });
      setLocation('/dashboard?tab=recommendations');
    } catch {
      toast({
        title: 'Не удалось сохранить жанры',
        description: 'Попробуйте еще раз.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    setLocation('/dashboard?tab=recommendations');
  };

  return (
    <div className="min-h-[100dvh] bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <Sparkles className="h-5 w-5 text-primary" />
              Настроим рекомендации под ваш вкус
            </CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Выберите жанры, которые вам нравятся. По ним мы подбираем книги, клубы и чтецов, а также формируем стартовый блок
              «Сообщество рекомендует для вас» из книг, которые пользователи чаще советуют друг другу.
            </CardDescription>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
              На этом шаге достаточно 3-5 жанров. Изменить выбор можно в профиле в любое время.
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Tags className="h-4 w-4 text-primary" />
              Выбор жанров
            </CardTitle>
            <CardDescription>
              Выбрано: {selectedGenres.length} из 8
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {isGenresLoading ? (
              <p className="text-sm text-muted-foreground">Загружаем каталог жанров...</p>
            ) : (
              groupedGenres.map((group) => (
                <div key={group.key} className="space-y-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</h3>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((genreLabel) => {
                      const active = selectedGenres.includes(genreLabel);
                      return (
                        <Badge
                          key={genreLabel}
                          variant={active ? 'default' : 'outline'}
                          className="cursor-pointer px-3 py-1 text-sm"
                          onClick={() => toggleGenre(genreLabel)}
                        >
                          {genreLabel}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ))
            )}

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={handleSkip} disabled={isSaving}>
                Пропустить
              </Button>
              <Button type="button" onClick={handleContinue} disabled={isSaving || isGenresLoading}>
                {isSaving ? 'Сохраняем...' : 'Продолжить'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}