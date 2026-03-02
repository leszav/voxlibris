import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { useGuest } from "@/hooks/use-guest";
import { Link } from "wouter";

export default function GuestLibrary() {
  const {
    isLoading,
    error,
    guest,
    book,
    position,
    analytics,
    hasBook,
    isBookExpired,
    expiresInDays,
    uploadBook,
    deleteBook,
    refreshAnalytics,
    trackEvent
  } = useGuest();

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (guest && hasBook) {
      refreshAnalytics();
      trackEvent("book_open");
    }
  }, [guest, hasBook, refreshAnalytics, trackEvent]);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file
    const allowedExtensions = [".epub", ".fb2"];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));

    if (!allowedExtensions.includes(ext)) {
      alert("Поддерживаются только EPUB и FB2 файлы");
      return;
    }

    if (file.size > 1024 * 1024) {
      alert("Файл слишком большой. Максимум 1 МБ");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      await uploadBook(file, (p) => {
        setUploadProgress(p);
      });
      await refreshAnalytics();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка при загрузке");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleDeleteBook() {
    if (!confirm("Вы уверены, что хотите удалить книгу?")) return;

    try {
      await deleteBook();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка при удалении");
    }
  }

  function handleReadBook() {
    if (book) {
      globalThis.location.href = `/guest/reader/${book.bookId}`;
    }
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="container py-8 max-w-2xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="container py-8 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold mb-2">Гостевая библиотека</h1>
          <p className="text-muted-foreground">
            Загрузите книгу и читайте без регистрации
          </p>
        </div>

        {/* Guest Info */}
        {guest && (
          <>
            {/* No Book State */}
            {(!hasBook || isBookExpired) && (
              <div className="space-y-6">
                <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center">
                  <div className="mb-4">
                    <span className="text-4xl">📚</span>
                  </div>
                  <h3 className="text-lg font-medium mb-2">
                    {isBookExpired ? "Срок действия книги истек" : "Загрузите книгу"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Поддерживаются EPUB и FB2 файлы до 1 МБ
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".epub,.fb2"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  <Button
                    className="rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? `Загрузка ${Math.round(uploadProgress)}%` : "Выбрать файл"}
                  </Button>
                </div>

                {/* Expiry Info */}
                {expiresInDays > 0 && (
                  <p className="text-center text-sm text-muted-foreground">
                    Осталось {expiresInDays} дней до истечения доступа
                  </p>
                )}
              </div>
            )}

            {/* Has Book State */}
            {hasBook && !isBookExpired && book && (
              <div className="space-y-6">
                {/* Book Card */}
                <div className="bg-card border rounded-2xl p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold mb-1">{book.title}</h3>
                      <p className="text-muted-foreground mb-2">{book.author}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="bg-muted px-2 py-1 rounded-full">
                          {book.format.toUpperCase()}
                        </span>
                        <span>~{Math.ceil(book.wordCount / 200)} мин чтения</span>
                        <span>{book.wordCount.toLocaleString()} слов</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        className="rounded-full"
                        onClick={handleReadBook}
                      >
                        Читать
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={handleDeleteBook}
                      >
                        Удалить
                      </Button>
                    </div>
                  </div>

                </div>

                {/* Reading Progress */}
                {position && (
                  <div className="bg-card border rounded-2xl p-4">
                    <h4 className="font-medium mb-3">Прогресс чтения</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Прочитано</span>
                        <span className="font-medium">{position.progressPercent}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${position.progressPercent}%` }}
                        />
                      </div>

                      {position.readingTimeMinutes > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Время чтения: {position.readingTimeMinutes} мин
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Analytics */}
                {analytics && (
                  <div className="bg-card border rounded-2xl p-4">
                    <h4 className="font-medium mb-3">Статистика</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold">{analytics.totalReadingTime}</p>
                        <p className="text-xs text-muted-foreground">минут</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{analytics.sessionsCount}</p>
                        <p className="text-xs text-muted-foreground">сессий</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">
                          {analytics.averageSessionTime || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">среднее</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-center gap-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".epub,.fb2"
                    className="hidden"
                    onChange={handleFileSelect}
                  />

                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    Заменить книгу
                  </Button>
                </div>
              </div>
            )}

            {/* Public Clubs Link */}
            <div className="mt-8 pt-8 border-t">
              <h3 className="font-medium mb-4">Книжные клубы</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Вы можете просматривать публичные клубы и подавать заявки на вступление
              </p>
              <Link href="/catalog">
                <Button variant="outline" className="rounded-full">
                  Перейти к клубам
                </Button>
              </Link>
            </div>
          </>
        )}

        {/* Error State */}
        {error && !error.includes("Too many requests from this source") && (
          <div className="text-center py-12">
            <p className="text-red-500 mb-4">{error}</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
