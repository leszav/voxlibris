import { Button } from "../../ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Chapter {
  chapterNumber: number;
  title?: string;
  content?: string;
}

interface ClubNavigationProps {
  chapters: Chapter[];
  currentChapter: number;
  onChapterChange: (chapterNumber: number) => void;
  totalChapters?: number;
  isLoading?: boolean;
}

export function ClubNavigation({ 
  chapters, 
  currentChapter, 
  onChapterChange, 
  totalChapters,
  isLoading = false 
}: Readonly<ClubNavigationProps>) {
  
  const handlePreviousChapter = () => {
    if (currentChapter > 1) {
      onChapterChange(currentChapter - 1);
    }
  };

  const handleNextChapter = () => {
    const maxChapter = totalChapters || chapters.length;
    if (currentChapter < maxChapter) {
      onChapterChange(currentChapter + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-between items-center mt-12 pt-8 border-t">
        <div className="flex items-center space-x-2">
          <div className="animate-pulse bg-muted h-10 w-32 rounded"></div>
        </div>
        <div className="animate-pulse bg-muted h-6 w-24 rounded"></div>
        <div className="flex items-center space-x-2">
          <div className="animate-pulse bg-muted h-10 w-32 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-between items-center mt-12 pt-8 border-t">
      <Button
        variant="outline"
        onClick={handlePreviousChapter}
        disabled={currentChapter <= 1}
        className="flex items-center gap-2"
      >
        <ChevronLeft className="w-4 h-4" />
        Предыдущая глава
      </Button>
      
      <span className="text-sm text-muted-foreground">
        Глава {currentChapter} из {totalChapters || chapters.length}
      </span>
      
      <Button
        variant="outline"
        onClick={handleNextChapter}
        disabled={currentChapter >= chapters.length}
        className="flex items-center gap-2"
      >
        Следующая глава
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

interface ClubChapterListProps {
  chapters: Chapter[];
  currentChapter: number;
  onChapterSelect: (chapterNumber: number) => void;
  isVisible: boolean;
  onClose: () => void;
}

export function ClubChapterList({ 
  chapters, 
  currentChapter, 
  onChapterSelect, 
  isVisible, 
  onClose 
}: Readonly<ClubChapterListProps>) {
  
  if (!isVisible) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {chapters.map((chapter) => (
        <Button
          key={chapter.chapterNumber}
          variant={currentChapter === chapter.chapterNumber ? "secondary" : "ghost"}
          className="w-full justify-start text-left h-auto py-2 px-3"
          onClick={() => {
            onChapterSelect(chapter.chapterNumber);
            onClose();
          }}
        >
          <div className="flex flex-col items-start">
            <span className="font-medium">
              {chapter.title || `Глава ${chapter.chapterNumber}`}
            </span>
            {chapter.title && (
              <span className="text-xs text-muted-foreground mt-1">
                Глава {chapter.chapterNumber}
              </span>
            )}
          </div>
        </Button>
      ))}
    </div>
  );
}
