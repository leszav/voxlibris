import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Mail, Loader2, CheckCircle2, Search, X, AlertCircle } from "lucide-react";
import { useInviteToClub } from "@/hooks/use-clubs";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/token-store";

interface InviteMemberModalProps {
  readonly clubId: string;
  readonly clubTitle: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  status: string;
}

interface InvitationResult {
  email: string;
  success: boolean;
  message?: string;
}

export function InviteMemberModal({ clubId, clubTitle }: InviteMemberModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [emailsText, setEmailsText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [invitationResults, setInvitationResults] = useState<InvitationResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const { toast } = useToast();
  const inviteMutation = useInviteToClub(clubId);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Поиск пользователей
  const { data: searchResults = [], isLoading: isSearching } = useQuery<User[]>({
    queryKey: ["users-search", searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      const token = getAccessToken();
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : (data.users ?? []);
    },
    enabled: searchQuery.length >= 2,
  });

  const parseEmails = (text: string): string[] => {
    // Разделяем по запятым, переносам строк, пробелам
    return text
      .split(/[,\s]+/)
      .map(email => email.trim())
      .filter(email => email.length > 0);
  };

  const handleMassInvite = async () => {
    const emails = parseEmails(emailsText);
    
    if (emails.length === 0) {
      toast({
        title: "Ошибка",
        description: "Введите хотя бы один email",
        variant: "destructive",
      });
      return;
    }

    // Валидация email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      toast({
        title: "Ошибка валидации",
        description: `Некорректные email: ${invalidEmails.slice(0, 3).join(", ")}${invalidEmails.length > 3 ? "..." : ""}`,
        variant: "destructive",
      });
      return;
    }

    // Отправляем массовое приглашение
    const results: InvitationResult[] = [];
    
    for (const email of emails) {
      try {
        await inviteMutation.mutateAsync(email);
        results.push({ email, success: true });
      } catch (error) {
        results.push({ 
          email, 
          success: false, 
          message: error instanceof Error ? error.message : "Ошибка отправки" 
        });
      }
    }

    setInvitationResults(results);
    setShowResults(true);
    
    const successCount = results.filter(r => r.success).length;
    toast({
      title: "Приглашения отправлены",
      description: `Успешно: ${successCount} из ${results.length}`,
    });
  };

  const handleUserInvite = async () => {
    if (selectedUsers.length === 0) {
      toast({
        title: "Ошибка",
        description: "Выберите хотя бы одного пользователя",
        variant: "destructive",
      });
      return;
    }

    const results: InvitationResult[] = [];
    
    for (const user of selectedUsers) {
      try {
        await inviteMutation.mutateAsync(user.email);
        results.push({ email: user.email, success: true });
      } catch (error) {
        results.push({ 
          email: user.email, 
          success: false, 
          message: error instanceof Error ? error.message : "Ошибка отправки" 
        });
      }
    }

    setInvitationResults(results);
    setShowResults(true);
    
    const successCount = results.filter(r => r.success).length;
    toast({
      title: "Приглашения отправлены",
      description: `Успешно: ${successCount} из ${results.length}`,
    });
  };

  const toggleUserSelection = (user: User) => {
    setSelectedUsers(prev => 
      prev.some(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    );
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      resetTimeoutRef.current = setTimeout(() => {
        setEmailsText("");
        setSearchQuery("");
        setSelectedUsers([]);
        setInvitationResults([]);
        setShowResults(false);
      }, 300);
    }
  };

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" aria-label="Пригласить участника">
          <UserPlus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Пригласить в клуб</DialogTitle>
          <DialogDescription>
            Отправьте приглашения в "{clubTitle}" по email или выберите пользователей
          </DialogDescription>
        </DialogHeader>

        {showResults ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Результаты отправки</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowResults(false)}>
                Отправить ещё
              </Button>
            </div>
            
            <ScrollArea className="h-[300px] rounded-md border p-4">
              <div className="space-y-2">
                {invitationResults.map((result) => (
                  <div
                    key={result.email}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      result.success ? "bg-green-50" : "bg-red-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {result.success ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{result.email}</p>
                        {result.message && (
                          <p className="text-xs text-muted-foreground">{result.message}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={result.success ? "default" : "destructive"}>
                      {result.success ? "Отправлено" : "Ошибка"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Button onClick={handleClose} className="w-full">
              Закрыть
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="emails" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="emails">По email</TabsTrigger>
              <TabsTrigger value="users">Выбрать пользователей</TabsTrigger>
            </TabsList>

            <TabsContent value="emails" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emails">Email адреса</Label>
                <Textarea
                  id="emails"
                  placeholder="user1@example.com&#10;user2@example.com, user3@example.com&#10;user4@example.com"
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  className="min-h-[150px] font-mono text-sm"
                  disabled={inviteMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Введите email через запятую, пробел или с новой строки. 
                  Незарегистрированные пользователи будут приглашены для регистрации.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                  disabled={inviteMutation.isPending}
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleMassInvite}
                  className="flex-1"
                  disabled={inviteMutation.isPending}
                >
                  {inviteMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Отправка...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Отправить приглашения
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="users" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="search">Поиск пользователей</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Имя или email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
                  {selectedUsers.map((user) => (
                    <Badge key={user.id} variant="secondary" className="gap-1">
                      {user.username}
                      <button
                        onClick={() => toggleUserSelection(user)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <ScrollArea className="h-[200px] rounded-md border">
                <div className="p-4 space-y-2">
                  {(() => {
                    if (isSearching) {
                      return (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      );
                    }
                    
                    if (searchResults.length > 0) {
                      return searchResults.map((user) => {
                        const isSelected = selectedUsers.some(u => u.id === user.id);
                        return (
                          <button
                            key={user.id}
                            onClick={() => toggleUserSelection(user)}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              isSelected
                                ? "bg-primary/10 border-primary"
                                : "hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{user.username}</p>
                                <p className="text-xs text-muted-foreground">{user.email}</p>
                              </div>
                              {isSelected && <CheckCircle2 className="w-5 h-5 text-primary" />}
                            </div>
                          </button>
                        );
                      });
                    }
                    
                    if (searchQuery.length >= 2) {
                      return (
                        <p className="text-center text-sm text-muted-foreground py-8">
                          Пользователи не найдены
                        </p>
                      );
                    }
                    
                    return (
                      <p className="text-center text-sm text-muted-foreground py-8">
                        Начните вводить имя или email
                      </p>
                    );
                  })()}
                </div>
              </ScrollArea>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  className="flex-1"
                  disabled={inviteMutation.isPending}
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleUserInvite}
                  className="flex-1"
                  disabled={inviteMutation.isPending || selectedUsers.length === 0}
                >
                  {inviteMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Отправка...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Пригласить ({selectedUsers.length})
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
