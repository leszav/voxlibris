import { Card, CardContent } from "@/components/ui/card";

interface HistoryBookCardProps {
  bookTitle: string;
  bookAuthor: string;
  bookCoverUrl?: string;
  completedAt: string;
  readingTimeMinutes?: number | string | null;
}

export function HistoryBookCard({
  bookTitle,
  bookAuthor,
  bookCoverUrl,
  completedAt,
  readingTimeMinutes
}: Readonly<HistoryBookCardProps>) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatReadingTime = (minutes?: number) => {
    if (!minutes || minutes <= 0) return '';
    
    if (minutes < 60) {
      return `${minutes} мин`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} ч`;
    }
    
    return `${hours} ч ${remainingMinutes} мин`;
  };

  const normalizedReadingTime = Number(readingTimeMinutes);
  const shouldShowReadingTime = Number.isFinite(normalizedReadingTime) && normalizedReadingTime > 0;

  return (
    <Card className="group hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-3 sm:p-4">
        <div className="flex gap-3 sm:gap-4">
          {/* Обложка книги */}
          <div className="flex-shrink-0">
            {bookCoverUrl ? (
              <img
                src={bookCoverUrl}
                alt={bookTitle}
                className="w-16 h-20 object-cover rounded-md"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = '/placeholder-book.png';
                }}
              />
            ) : (
              <div className="w-16 h-20 bg-muted rounded-md flex items-center justify-center">
                <div className="text-2xl">📖</div>
              </div>
            )}
          </div>

          {/* Информация о книге */}
          <div className="flex-1 min-w-0">
            <h3 className="mb-1 line-clamp-2 font-semibold text-foreground">
              {bookTitle}
            </h3>
            <p className="text-sm text-muted-foreground mb-2">
              {bookAuthor}
            </p>
            
            <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Прочитано: {formatDate(completedAt)}</span>
              {shouldShowReadingTime && (
                <span>{formatReadingTime(normalizedReadingTime)}</span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
