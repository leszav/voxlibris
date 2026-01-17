import {
  AlertCircle,
  CheckCircle,
  Clock,
  Mail,
  RefreshCw,
  Trash,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ClubInvitationWithInviter,
  useClearAllInvitations,
  useClubInvitations,
  useResendInvitation,
  useRevokeInvitation,
} from "@/hooks/use-clubs";
import { useToast } from "@/hooks/use-toast";

interface InvitationsListProps {
  readonly clubId: string;
  readonly isOwner?: boolean;
}

export function InvitationsList({ clubId, isOwner }: InvitationsListProps) {
  const { data: invitations, isLoading } = useClubInvitations(clubId);
  const revokeInvitation = useRevokeInvitation(clubId);
  const resendInvitation = useResendInvitation(clubId);
  const clearAllInvitations = useClearAllInvitations(clubId);
  const { toast } = useToast();
  const [invitationToRevoke, setInvitationToRevoke] = useState<string | null>(null);
  const [invitationIdToRemove, setInvitationIdToRemove] = useState<string | null>(null);
  const [showClearAll, setShowClearAll] = useState(false);

  const handleRevoke = async (invitationId: string) => {
    try {
      await revokeInvitation.mutateAsync(invitationId);
      toast({
        title: "Приглашение отозвано",
        description: "Приглашение успешно отозвано",
      });
      setInvitationToRevoke(null);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось отозвать приглашение",
        variant: "destructive",
      });
    }
  };

  const handleResend = async (invitationId: string) => {
    try {
      await resendInvitation.mutateAsync(invitationId);
      toast({
        title: "Приглашение отправлено повторно",
        description: "Новое приглашение успешно отправлено на почту",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description:
          error instanceof Error ? error.message : "Не удалось отправить приглашение повторно",
        variant: "destructive",
      });
    }
  };

  const handleRemoveInvitation = async (invitationId: string) => {
    try {
      await revokeInvitation.mutateAsync(invitationId);
      toast({
        title: "Приглашение удалено",
        description: "Приглашение удалено из списка",
      });
      setInvitationIdToRemove(null);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось удалить приглашение",
        variant: "destructive",
      });
    }
  };

  const handleClearAll = async () => {
    try {
      const result = await clearAllInvitations.mutateAsync();
      toast({
        title: "Список очищен",
        description: `Удалено приглашений: ${result.deletedCount}`,
      });
      setShowClearAll(false);
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось очистить список",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (invitation: ClubInvitationWithInviter) => {
    const isExpired = new Date(invitation.expiresAt) < new Date();

    if (isExpired && invitation.status === "pending") {
      return (
        <Badge variant="secondary" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Истекло
        </Badge>
      );
    }

    switch (invitation.status) {
      case "pending":
        return (
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            Ожидает
          </Badge>
        );
      case "accepted":
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <CheckCircle className="h-3 w-3" />
            Принято
          </Badge>
        );
      default:
        return <Badge variant="secondary">{invitation.status}</Badge>;
    }
  };

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return dateObj.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Приглашения
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Загрузка...</p>
        </CardContent>
      </Card>
    );
  }

  if (!invitations || !Array.isArray(invitations) || invitations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Приглашения
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Приглашения еще не отправлялись</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Приглашения ({invitations.length})
            </CardTitle>
            {isOwner && invitations.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClearAll(true)}
                disabled={clearAllInvitations.isPending}
                className="text-muted-foreground"
              >
                <Trash className="h-4 w-4 mr-2" />
                Очистить все
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {invitations.map((invitation) => {
              const isExpired = new Date(invitation.expiresAt) < new Date();
              const canRevoke = invitation.status === "pending" && !isExpired;
              const canResend =
                (isExpired || invitation.status !== "pending") && invitation.status !== "accepted";

              return (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium truncate">{invitation.email}</span>
                      {getStatusBadge(invitation)}
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      {invitation.inviterName && <p>Пригласил: {invitation.inviterName}</p>}
                      <p>Отправлено: {formatDate(invitation.createdAt)}</p>
                      <p>
                        Истекает: {formatDate(invitation.expiresAt)}
                        {isExpired && <span className="text-destructive ml-2">(истекло)</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canResend && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(invitation.id)}
                        disabled={resendInvitation.isPending}
                        title="Отправить приглашение повторно"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInvitationIdToRemove(invitation.id)}
                      disabled={revokeInvitation.isPending}
                      title="Удалить из списка"
                    >
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    {canRevoke && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setInvitationToRevoke(invitation.id)}
                        disabled={revokeInvitation.isPending}
                        title="Отозвать приглашение"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!invitationToRevoke}
        onOpenChange={(open) => !open && setInvitationToRevoke(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отозвать приглашение?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Пользователь не сможет воспользоваться этим
              приглашением.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => invitationToRevoke && handleRevoke(invitationToRevoke)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Отозвать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!invitationIdToRemove}
        onOpenChange={(open) => !open && setInvitationIdToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить приглашение?</AlertDialogTitle>
            <AlertDialogDescription>
              Приглашение будет удалено из списка. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => invitationIdToRemove && handleRemoveInvitation(invitationIdToRemove)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearAll} onOpenChange={(open) => !open && setShowClearAll(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Очистить все приглашения?</AlertDialogTitle>
            <AlertDialogDescription>
              Будут удалены все приглашения клуба ({invitations.length}). Это действие нельзя
              отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Очистить все
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
