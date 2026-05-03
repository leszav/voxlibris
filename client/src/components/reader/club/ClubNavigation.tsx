import { useEffect, useRef } from "react";
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
    <div className="flex flex-wrap justify-between items-center gap-2 mt-8 sm:mt-12 pt-4 sm:pt-8 border-t">
      <Button
        variant="outline"
        size="sm"
        onClick={handlePreviousChapter}
        disabled={currentChapter <= 1}
        className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm"
      >
        <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
        <span className="hidden xs:inline">Пред.</span>
      </Button>
      
      <span className="text-xs sm:text-sm text-muted-foreground order-first sm:order-none w-full sm:w-auto text-center">
        Глава {currentChapter} из {totalChapters || chapters.length}
      </span>
      
      <Button
        variant="outline"
        size="sm"
        onClick={handleNextChapter}
        disabled={currentChapter >= chapters.length}
        className="flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-2 text-xs sm:text-sm"
      >
        <span className="hidden xs:inline">След.</span>
        <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
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
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isVisible) {
      activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="space-y-0.5">
      {chapters.map((chapter) => {
        const isActive = currentChapter === chapter.chapterNumber;
        return (
          <Button
            key={chapter.chapterNumber}
            ref={isActive ? activeRef : undefined}
            variant={isActive ? "secondary" : "ghost"}
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
        );
      })}
    </div>
  );
}
