import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, type RichTextEditorRef } from "@/components/ui/rich-text-editor";
import { HtmlContentRenderer } from "@/components/ui/html-content-renderer";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MessageCircle, Reply, Trash2, AlertTriangle, Send, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

const MAX_CHARS = 3000;

interface ClubDiscussionMessage {
  id: string;
  clubId: string;
  userId: string;
  content: string;
  parentId: string | null;
  quotedContent: string | null;
  isWarning: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    email: string;
  };
  replies?: ClubDiscussionMessage[];
}

interface ClubDiscussionBoardProps {
  readonly clubId: string;
  readonly isOwner: boolean;
  readonly currentUserId: string;
}

// Компонент для рендеринга HTML-контента сообщений
function MessageContent({ content }: Readonly<{ content: string }>) {
  // Если контент содержит HTML-теги, используем HtmlContentRenderer
  if (content.includes('<') && content.includes('>')) {
    return <HtmlContentRenderer content={content} className="text-sm" />;
  }
  
  // Иначе рендерим как обычный текст
  return <p className="text-sm whitespace-pre-wrap">{content}</p>;
}


export function ClubDiscussionBoard({ clubId, isOwner }: Readonly<ClubDiscussionBoardProps>) {
  const [newMessage, setNewMessage] = useState("");
  const [replyingTo, setReplyingTo] = useState<ClubDiscussionMessage | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [messageToWarn, setMessageToWarn] = useState<ClubDiscussionMessage | null>(null);
  const newMessageEditorRef = useRef<RichTextEditorRef>(null);
  const replyEditorRef = useRef<RichTextEditorRef>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Получить все обсуждения
  const { data: discussions = [], isLoading } = useQuery<ClubDiscussionMessage[]>({
    queryKey: ["club-discussions", clubId],
    queryFn: () => apiRequest(`/api/clubs/${clubId}/discussions`),
    refetchInterval: 5000,
  });

  // Сортируем сообщения: новые первыми
  const sortedDiscussions = [...discussions].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return bTime - aTime;
  });

  // Создать новое сообщение
  const createMessageMutation = useMutation({
    mutationFn: (content: string) =>
      apiRequest(`/api/clubs/${clubId}/discussions`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-discussions", clubId] });
      setNewMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Ответить на сообщение
  const replyMutation = useMutation({
    mutationFn: ({ discussionId, content, quotedContent }: { discussionId: string; content: string; quotedContent?: string }) =>
      apiRequest(`/api/clubs/${clubId}/discussions/${discussionId}/reply`, {
        method: "POST",
        body: JSON.stringify({ content, quotedContent }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-discussions", clubId] });
      setReplyingTo(null);
      setReplyContent("");
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Отправить предупреждение
  const warnMutation = useMutation({
    mutationFn: ({ discussionId, content }: { discussionId: string; content: string }) =>
      apiRequest(`/api/clubs/${clubId}/discussions/${discussionId}/warn`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-discussions", clubId] });
      setShowWarningDialog(false);
      setWarningMessage("");
      setMessageToWarn(null);
      toast({ title: "Предупреждение отправлено" });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Удалить сообщение
  const deleteMutation = useMutation({
    mutationFn: (discussionId: string) =>
      apiRequest(`/api/clubs/${clubId}/discussions/${discussionId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["club-discussions", clubId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    const content = newMessageEditorRef.current?.getContent();
    if (!content?.trim()) return;
    createMessageMutation.mutate(content);
    newMessageEditorRef.current?.setContent('');
  };

  const handleReply = (message: ClubDiscussionMessage) => {
    setReplyingTo(message);
    setReplyContent("");
  };

  const handleSendReply = () => {
    const content = replyEditorRef.current?.getContent();
    if (!replyingTo || !content?.trim()) return;
    replyMutation.mutate({
      discussionId: replyingTo.id,
      content: content,
      quotedContent: replyingTo.content.substring(0, 100),
    });
    replyEditorRef.current?.setContent('');
    setReplyingTo(null);
  };

  const handleWarn = (message: ClubDiscussionMessage) => {
    setMessageToWarn(message);
    setShowWarningDialog(true);
  };

  const handleSendWarning = () => {
    if (!messageToWarn || !warningMessage.trim()) return;
    warnMutation.mutate({
      discussionId: messageToWarn.id,
      content: warningMessage.trim(),
    });
  };

  const handleDelete = (message: ClubDiscussionMessage) => {
    // Удаляем без модалки - тихая очистка
    deleteMutation.mutate(message.id);
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Форма нового сообщения */}
      <Card className="p-4">
        <RichTextEditor
          ref={newMessageEditorRef}
          placeholder="Напишите сообщение..."
          maxLength={MAX_CHARS}
          value={newMessage}
          onChange={setNewMessage}
        />
        <div className="flex justify-end mt-2">
          <Button
            onClick={handleSendMessage}
            disabled={createMessageMutation.isPending}
            size="sm"
          >
            {createMessageMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Отправка...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Отправить
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Список сообщений */}
      <div className="space-y-4 max-h-[600px] overflow-y-auto border rounded-lg p-4 bg-background">
        {sortedDiscussions.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Пока нет сообщений. Начните обсуждение!</p>
          </div>
        ) : (
          sortedDiscussions.map((message) => (
            <Card key={message.id} className={`p-4 ${message.isWarning ? 'border-red-500 bg-red-50' : ''}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="font-semibold text-sm">{message.user.username}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: ru })}
                  </span>
                </div>
                {isOwner && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleWarn(message)}
                      title="Отправить предупреждение"
                    >
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(message)}
                      title="Удалить сообщение"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                )}
              </div>
              
              <MessageContent content={message.content} />

              {message.quotedContent && (
                <div className="mt-2 pl-3 border-l-2 border-muted text-xs text-muted-foreground italic">
                  {message.quotedContent}...
                </div>
              )}

              <div className="mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleReply(message)}
                  className="text-xs"
                >
                  <Reply className="h-3 w-3 mr-1" />
                  Ответить
                </Button>
              </div>

              {/* Ответы на сообщение */}
              {message.replies && message.replies.length > 0 && (
                <div className="mt-4 ml-6 space-y-3 border-l-2 border-muted pl-4">
                  {message.replies.map((reply) => (
                    <div key={reply.id} className={`${reply.isWarning ? 'bg-red-50 p-2 rounded border border-red-200' : ''}`}>
                      <div className="flex items-start justify-between mb-1">
                        <div>
                          <span className="font-semibold text-xs">{reply.user.username}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {formatDistanceToNow(new Date(reply.createdAt), { addSuffix: true, locale: ru })}
                          </span>
                        </div>
                        {isOwner && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(reply)}
                            title="Удалить ответ"
                          >
                            <Trash2 className="h-3 w-3 text-red-600" />
                          </Button>
                        )}
                      </div>
                      {reply.quotedContent && (
                        <div className="mb-1 text-xs text-muted-foreground italic opacity-70">
                          {" "}{String.fromCodePoint(62)}{" "}{reply.quotedContent}...
                        </div>
                      )}
                      <MessageContent content={reply.content} />
                    </div>
                  ))}
                </div>
              )}

              {/* Форма ответа */}
              {replyingTo?.id === message.id && (
                <div className="mt-4 ml-6 space-y-2">
                  <div className="text-xs text-muted-foreground mb-2">
                    Ответ на сообщение {message.user.username}:
                  </div>
                  <RichTextEditor
                    ref={replyEditorRef}
                    placeholder="Ваш ответ..."
                    maxLength={MAX_CHARS}
                    value={replyContent}
                    onChange={setReplyContent}
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <Button
                      onClick={handleSendReply}
                      disabled={replyMutation.isPending}
                      size="sm"
                    >
                      {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отправить"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setReplyingTo(null)}
                      size="sm"
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Диалог предупреждения */}
      <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отправить предупреждение</AlertDialogTitle>
            <AlertDialogDescription>
              Предупреждение будет отображено красным жирным шрифтом и видно всем участникам клуба.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={warningMessage}
	          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setWarningMessage(e.target.value)}
            placeholder="Текст предупреждения..."
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendWarning}
              disabled={!warningMessage.trim() || warnMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {warnMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Отправить предупреждение"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
