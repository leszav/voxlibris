import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useClubBookUpload, type DuplicateMatch, type UploadMetadata } from "@/hooks/use-books-v2";
import { Loader2, Upload, FileText, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DuplicateWarningModal } from "@/components/ui/duplicate-warning-modal";
import { ApiError } from "@/lib/queryClient";
import { upgradeDescription } from "@/lib/upgrade-cta";

interface ClubUploadWizardProps {
    readonly clubId: string;
    readonly onSuccess: () => void;
    readonly onCancel: () => void;
}

export function ClubUploadWizard({ clubId, onSuccess, onCancel }: Readonly<ClubUploadWizardProps>) {
    const [step, setStep] = useState<'upload' | 'metadata' | 'processing'>('upload');
    const [sessionId, setSessionId] = useState<string | null>(null);
    type BookUploadMetadata = UploadMetadata & {
        coverPreview?: string | null;
        recommendedReadingOrder?: number;
    };
    const [metadata, setMetadata] = useState<BookUploadMetadata>({ title: "", author: "" });
    const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);

    const { upload, confirm } = useClubBookUpload(clubId);

    const showUpgradeToast = (error: unknown) => toast({
        title: "Лимит тарифа исчерпан",
        description: upgradeDescription(error, "Чтобы добавить больше книг в клуб, откройте раздел «Тарифы» и выберите расширенный тариф."),
        variant: "destructive",
    });

    const handleFileSelect = async (selectedFile: File) => {
        setStep('processing');

        try {
            const result = await upload.mutateAsync(selectedFile);
            setSessionId(result.sessionId);
            setMetadata(result.metadata);
            setDuplicates(result.duplicates || []);
            
            // Если найдены дубликаты, показываем модальное окно
            if (result.duplicates && result.duplicates.length > 0) {
                setShowDuplicateModal(true);
            }
            
            setStep('metadata');
        } catch (error) {
            toast({
                title: "Ошибка загрузки файла",
                description: error instanceof Error ? error.message : "Не удалось загрузить файл",
                variant: "destructive"
            });
            setStep('upload');
        }
    };

    const handleConfirm = async () => {
        if (!sessionId) return;

        setStep('processing');
        try {
            await confirm.mutateAsync({ sessionId, metadata });
            toast({
                title: "Книга добавлена в клуб",
                description: `"${metadata.title}" теперь доступна участникам клуба`,
            });
            onSuccess();
        } catch (error) {
            if (error instanceof ApiError && error.code === "LIMIT_EXCEEDED") {
                showUpgradeToast(error);
                setStep('metadata');
                return;
            }

            toast({
                title: "Ошибка сохранения",
                description: error instanceof Error ? error.message : "Не удалось сохранить книгу",
                variant: "destructive"
            });
            setStep('metadata');
        }
    };

    const handleDuplicateContinue = () => {
        setShowDuplicateModal(false);
        // Пользователь решил продолжить загрузку несмотря на дубликаты
    };

    const handleDuplicateCancel = () => {
        setShowDuplicateModal(false);
        // Возвращаемся к началу
        setStep('upload');
        setSessionId(null);
        setMetadata({ title: "", author: "" });
        setDuplicates([]);
    };

    const handleGenreChange = (value: string) => {
        setMetadata((current) => ({
            ...current,
            genre: value,
            genres: value.trim() ? [value.trim()] : [],
        }));
    };

    if (step === 'processing') {
        return (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-green-600" />
                <p className="text-lg font-medium">
                    {upload.isPending ? "Анализ файла..." : "Публикация в клубе..."}
                </p>
                <p className="text-sm text-muted-foreground">Пожалуйста, подождите</p>
            </div>
        );
    }

    if (step === 'metadata') {
        return (
            <>
                <div className="space-y-6">
                    <div className="text-center">
                        <h3 className="text-lg font-semibold">Параметры клубной книги</h3>
                        <p className="text-sm text-muted-foreground">
                            Проверьте данные перед публикацией для всех участников
                        </p>
                    </div>

                    <div className="grid gap-4">
                        <div className="flex flex-col items-center space-y-4 mb-4">
                            <div className="relative w-32 h-48 bg-muted rounded-md overflow-hidden border">
                                {metadata.coverPreview ? (
                                    <img
                                        src={metadata.coverPreview}
                                        alt="Cover preview"
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center w-full h-full text-muted-foreground">
                                        <FileText className="w-12 h-12 opacity-20" />
                                    </div>
                                )}
                            </div>
                            <div className="flex space-x-2">
                                <Button variant="outline" size="sm" asChild>
                                    <label className="cursor-pointer">
                                        <Upload className="w-4 h-4 mr-2" />
                                        Загрузить
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        const base64 = reader.result as string;
                                                        setMetadata({
                                                            ...metadata,
                                                            coverPreview: base64,
                                                            coverImageData: base64
                                                        });
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                        />
                                    </label>
                                </Button>
                                {metadata.coverPreview && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setMetadata({
                                            ...metadata,
                                            coverPreview: null,
                                            coverImageData: null
                                        })}
                                    >
                                        Удалить
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="title">Название</Label>
                                <Input
                                    id="title"
                                    value={metadata.title || ''}
                                    onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="author">Автор</Label>
                                <Input
                                    id="author"
                                    value={metadata.author || ''}
                                    onChange={(e) => setMetadata({ ...metadata, author: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Описание</Label>
                            <Textarea
                                id="description"
                                value={metadata.description || ''}
                                onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                                rows={4}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="genre">Жанр</Label>
                                <Input
                                    id="genre"
                                    value={metadata.genre || ''}
                                    placeholder="Например: Киберпанк, Социальная НФ"
                                    onChange={(e) => handleGenreChange(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Несколько жанров указывайте через запятую.
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="readingOrder">Порядок чтения (опционально)</Label>
                                <Input
                                    id="readingOrder"
                                    type="number"
                                    placeholder="Например: 1"
                                    value={metadata.recommendedReadingOrder ?? ''}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setMetadata({
                                            ...metadata,
                                            recommendedReadingOrder: value ? Number(value) : undefined
                                        });
                                    }}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="year">Год издания</Label>
                                <Input
                                    id="year"
                                    type="number"
                                    value={metadata.publicationYear ?? ''}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        setMetadata({
                                            ...metadata,
                                            publicationYear: value ? Number(value) : undefined
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                        <Button variant="outline" onClick={onCancel}>Отмена</Button>
                        <Button onClick={handleConfirm} className="bg-green-600 hover:bg-green-700">Опубликовать</Button>
                    </div>
                </div>

                {/* Модальное окно с предупреждением о дубликатах */}
                <DuplicateWarningModal
                    open={showDuplicateModal}
                    duplicates={duplicates}
                    onContinue={handleDuplicateContinue}
                    onCancel={handleDuplicateCancel}
                    context="club"
                />
            </>
        );
    }

    return (
        <div className="space-y-6">
            <div className="text-center">
                <h3 className="text-lg font-semibold mb-2 flex items-center justify-center gap-2">
                    <Users className="w-5 h-5 text-green-600" />
                    Загрузка в клуб
                </h3>
                <p className="text-sm text-muted-foreground">
                    Книга будет доступна всем участникам клуба
                </p>
            </div>

            <Card className="border-2 border-dashed border-green-200 bg-green-50/30">
                <CardContent className="p-4 sm:p-8 text-center space-y-4">
                    <div className="flex justify-center">
                        <Upload className="w-12 h-12 text-green-600/50" />
                    </div>
                    <div>
                        <p className="text-lg font-medium">
                            Перетащите файл сюда или нажмите для выбора
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                            EPUB или FB2, до 50 МБ
                        </p>
                    </div>
                    <Input
                        type="file"
                        accept=".epub,.fb2"
                        className="hidden"
                        id="club-file-upload"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileSelect(file);
                        }}
                    />
                    <Button asChild variant="outline" className="border-green-200 hover:bg-green-50 text-green-700">
                        <label htmlFor="club-file-upload" className="cursor-pointer">
                            <FileText className="w-4 h-4 mr-2" />
                            Выбрать файл
                        </label>
                    </Button>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button variant="ghost" onClick={onCancel}>Отмена</Button>
            </div>
        </div>
    );
}
