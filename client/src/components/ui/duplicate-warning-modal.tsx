import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, BookOpen } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DuplicateMatch } from "@/hooks/use-books-v2";

interface DuplicateWarningModalProps {
    open: boolean;
    duplicates: DuplicateMatch[];
    onContinue: () => void;
    onCancel: () => void;
    context?: 'personal' | 'club';
}

export function DuplicateWarningModal({
    open,
    duplicates,
    onContinue,
    onCancel,
    context = 'personal'
}: DuplicateWarningModalProps) {
    const contextText = context === 'personal' 
        ? 'вашей библиотеке' 
        : 'этом клубе';

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-yellow-100 rounded-full">
                            <AlertTriangle className="h-6 w-6 text-yellow-600" />
                        </div>
                        <DialogTitle className="text-xl">
                            Найдены похожие книги
                        </DialogTitle>
                    </div>
                    <DialogDescription className="text-base">
                        В {contextText} уже есть {duplicates.length === 1 ? 'книга' : `${duplicates.length} ${duplicates.length > 4 ? 'книг' : 'книги'}`}, 
                        {duplicates.length === 1 ? ' похожая' : ' похожие'} на загружаемую.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    <ScrollArea className="h-[280px] pr-4">
                        <div className="space-y-3">
                            {duplicates.map((dup) => (
                                <div 
                                    key={dup.bookId} 
                                    className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg hover:bg-yellow-100 transition-colors"
                                >
                                    <BookOpen className="h-5 w-5 mt-0.5 text-yellow-700 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-gray-900 line-clamp-2">
                                            "{dup.title}"
                                        </p>
                                        <p className="text-sm text-gray-700 mt-0.5">
                                            {dup.author}
                                        </p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className="flex-1">
                                                <div className="h-1.5 bg-yellow-200 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-yellow-500 rounded-full transition-all"
                                                        style={{ width: `${dup.similarity}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <span className="text-xs font-medium text-yellow-700 shrink-0">
                                                {dup.similarity}%
                                            </span>
                                        </div>
                                        <p className="text-xs text-yellow-600 mt-1">
                                            {dup.matchReason}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                    <p>
                        <strong>Совет:</strong> Вы можете продолжить загрузку, если это другое издание или версия книги.
                    </p>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button 
                        variant="outline" 
                        onClick={onCancel}
                        className="flex-1 sm:flex-none"
                    >
                        Отменить загрузку
                    </Button>
                    <Button 
                        onClick={onContinue}
                        className="flex-1 sm:flex-none bg-primary hover:bg-primary/90"
                    >
                        Загрузить всё равно
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
