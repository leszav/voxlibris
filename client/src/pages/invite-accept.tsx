import { useEffect, useRef, useState } from 'react';
import { useLocation, useRoute, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useInvitationByToken, useAcceptInvitation, useDeclineInvitation } from '@/hooks/use-clubs';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Mic, CheckCircle, XCircle, AlertCircle, Loader2, Users } from 'lucide-react';

export default function InviteAccept() {
  const [, params] = useRoute('/invite/:token');
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const token = params?.token || '';
  
  const { data: invitation, isLoading, error } = useInvitationByToken(token);
  const acceptInvitation = useAcceptInvitation();
  const declineInvitation = useDeclineInvitation();
  const [actionTaken, setActionTaken] = useState<'accepted' | 'removed' | null>(null);
  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRedirect = (to: string, delayMs: number) => {
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
    }
    redirectTimeoutRef.current = setTimeout(() => {
      setLocation(to);
    }, delayMs);
  };

  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Если пользователь не авторизован, перенаправляем на регистрацию с параметрами приглашения
    if (!isLoading && invitation && !isAuthenticated) {
      const inviteEmail = invitation.email;
      // Сохраняем информацию о приглашении в sessionStorage для использования после регистрации
      sessionStorage.setItem('pendingInvitation', JSON.stringify({
        token,
        clubId: invitation.club?.id,
      }));
      // Перенаправляем на регистрацию с email
      toast({
        title: "Необходима регистрация",
        description: "Создайте аккаунт, чтобы принять приглашение",
      });
      setLocation(`/auth/register?email=${encodeURIComponent(inviteEmail || '')}&invite=${token}`);
    }
  }, [isLoading, invitation, isAuthenticated, token, setLocation, toast]);

  const handleAccept = async () => {
    if (!invitation || !isAuthenticated) return;

    try {
      const result = await acceptInvitation.mutateAsync({ token });
      
      setActionTaken('accepted');
      toast({
        title: "Приглашение принято!",
        description: `Вы присоединились к клубу "${invitation.clubName || invitation.club?.title || ''}"`,
      });

      // Перенаправляем в клуб через 2 секунды
      scheduleRedirect(`/clubs/${result.club?.id || invitation.club?.id}`, 2000);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось принять приглашение",
        variant: "destructive",
      });
    }
  };

  const handleDecline = async () => {
    if (!invitation) return;

    try {
      await declineInvitation.mutateAsync({ token });
      
      // Сервер теперь удаляет приглашение при отклонении, поэтому
      // показываем пользователю, что приглашение удалено.
      setActionTaken('removed');
      toast({
        title: "Приглашение удалено",
        description: "Вы отклонили приглашение и оно было удалено",
      });

      // Перенаправляем на главную через 2 секунды
      scheduleRedirect('/', 2000);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось отклонить приглашение",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">Загрузка приглашения...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6">
          {/* Logo */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
              <Mic className="h-6 w-6 text-accent" />
              <span>VoxLibris</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-center mb-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <CardTitle className="text-center">Приглашение не найдено</CardTitle>
              <CardDescription className="text-center">
                Это приглашение недействительно, истекло или уже было использовано
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/">
                <Button className="w-full" variant="outline">
                  Вернуться на главную
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isExpired = invitation.expiresAt ? new Date(invitation.expiresAt) < new Date() : false;
  const alreadyResponded = typeof invitation.status === 'string' ? invitation.status !== 'pending' : false;

  if (actionTaken === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Добро пожаловать!</h2>
            <p className="text-muted-foreground mb-4">
              Вы успешно присоединились к клубу "{invitation.clubName}"
            </p>
            <p className="text-sm text-muted-foreground">
              Перенаправление в клуб...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  

  if (actionTaken === 'removed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Приглашение удалено</h2>
            <p className="text-muted-foreground">
              Вы отклонили приглашение и оно было удалено
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 font-serif text-2xl font-bold text-primary">
            <Mic className="h-6 w-6 text-accent" />
            <span>VoxLibris</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Приглашение в книжный клуб
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <Users className="h-12 w-12 text-primary" />
            </div>
            <CardTitle className="text-center">
              Приглашение в клуб
            </CardTitle>
            <CardDescription className="text-center">
              {invitation.clubName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isExpired && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <p className="text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Это приглашение истекло
                </p>
              </div>
            )}

            {alreadyResponded && (
              <div className="bg-muted rounded-lg p-4">
                <p className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  На это приглашение уже дан ответ ({invitation.status === 'accepted' ? 'принято' : 'отклонено'})
                </p>
              </div>
            )}

            {!isExpired && !alreadyResponded && isAuthenticated && (
              <>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Вы приглашены присоединиться к книжному клубу <strong>{invitation.clubName}</strong></p>
                  {user?.email && (
                    <p className="text-xs">Приглашение для: {user.email}</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={handleAccept}
                    disabled={acceptInvitation.isPending}
                    className="flex-1"
                  >
                    {acceptInvitation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Принимаю...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Принять
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleDecline}
                    disabled={declineInvitation.isPending}
                    variant="outline"
                    className="flex-1"
                  >
                    {declineInvitation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Отклоняю...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Отклонить
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}

            {!isAuthenticated && (
              <div className="text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                Перенаправление на регистрацию...
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-primary">
            ← Вернуться на главную
          </Link>
        </div>
      </div>
    </div>
  );
}
