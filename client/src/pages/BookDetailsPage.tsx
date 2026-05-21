import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Book, Clock, User, Calendar, ArrowLeft, BookOpen } from 'lucide-react';

interface BookDetails {
  id: string;
  title: string;
  author: string;
  description?: string;
  coverUrl?: string;
  publisher?: string;
  publishedYear?: string; // publishDate из БД
  language?: string;
  isbn?: string;
  createdAt: string;
  uploadedBy: {
    id: string;
    username: string;
    displayName?: string;
  };
  preview?: {
    text: string;
    chapterTitle?: string;
  };
}

export default function BookDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [showFullPreview, setShowFullPreview] = useState(false);

  const { data: book, isLoading, error } = useQuery<BookDetails>({
    queryKey: [`/api/books/${id}/details`],
    enabled: !!id,
  });

  useEffect(() => {
    if (error) {
      console.error('Error loading book details:', error);
    }
  }, [error]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container mx-auto max-w-4xl py-8 px-4">
          <Skeleton className="h-8 w-32 mb-6" />
          <div className="grid md:grid-cols-[300px_1fr] gap-6">
            <Skeleton className="h-[400px] w-full" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error || !book) {
    return (
      <MainLayout>
        <div className="container mx-auto max-w-4xl py-8 px-4">
          <Button variant="ghost" onClick={() => setLocation('/catalog')} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад к каталогу
          </Button>
          <Card>
            <CardHeader>
              <CardTitle>Книга не найдена</CardTitle>
              <CardDescription>
                Запрошенная книга не существует или была удалена.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }

  const previewText = book.preview?.text || '';
  const displayPreview = showFullPreview ? previewText : previewText.slice(0, 1000);
  const hasMorePreview = previewText.length > 1000;

  return (
    <MainLayout>
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <Button variant="ghost" onClick={() => setLocation('/catalog')} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Назад к каталогу
        </Button>

        <div className="grid md:grid-cols-[300px_1fr] gap-6">
          {/* Обложка книги */}
          <div className="space-y-4">
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={book.title}
                className="w-full rounded-lg shadow-lg object-cover aspect-[2/3]"
              />
            ) : (
              <div className="w-full aspect-[2/3] rounded-lg bg-muted flex items-center justify-center">
                <Book className="h-24 w-24 text-muted-foreground" />
              </div>
            )}

            <Button className="w-full" size="lg" onClick={() => setLocation(`/books/${id}/read`)}>
              <BookOpen className="mr-2 h-5 w-5" />
              Читать книгу
            </Button>
          </div>

          {/* Информация о книге */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">{book.title}</h1>
              <p className="text-xl text-muted-foreground mb-4">{book.author}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {book.publisher && <Badge variant="secondary">{book.publisher}</Badge>}
                {book.language && <Badge variant="outline">{book.language}</Badge>}
                {book.publishedYear && <Badge variant="outline">{book.publishedYear}</Badge>}
              </div>

              {book.description && (
                <Card className="mb-4">
                  <CardHeader>
                    <CardTitle className="text-lg">Описание</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{book.description}</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Метаданные */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Информация</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {book.isbn && (
                  <div className="flex items-center gap-2 text-sm">
                    <Book className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">ISBN:</span>
                    <span className="font-medium">{book.isbn}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Загрузил:</span>
                  <Button
                    variant="link"
                    className="h-auto p-0 font-medium"
                    onClick={() => setLocation(`/profile/${book.uploadedBy.username}`)}
                  >
                    {book.uploadedBy.displayName || book.uploadedBy.username}
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Добавлена:</span>
                  <span className="font-medium">
                    {new Date(book.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Фрагмент текста */}
            {previewText && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {book.preview?.chapterTitle || 'Фрагмент для ознакомления'}
                  </CardTitle>
                  <CardDescription>
                    Первые главы книги доступны для предварительного просмотра
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none">
                    <p className="whitespace-pre-wrap leading-relaxed text-sm">
                      {displayPreview}
                      {!showFullPreview && hasMorePreview && '...'}
                    </p>
                  </div>

                  {hasMorePreview && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShowFullPreview(!showFullPreview)}
                    >
                      {showFullPreview ? 'Свернуть' : 'Читать далее'}
                    </Button>
                  )}

                  <div className="mt-6 pt-6 border-t">
                    <p className="text-sm text-muted-foreground mb-4">
                      Чтобы прочитать книгу полностью, нажмите кнопку "Читать книгу"
                    </p>
                    <Button onClick={() => setLocation(`/books/${id}/read`)}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Читать книгу
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
