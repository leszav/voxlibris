import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserCog, AlertTriangle } from "lucide-react";
import { modalConfirm, useToast } from "@/hooks/use-toast";
import { getAccessToken } from "@/lib/token-store";
import type { ClubMemberWithUser } from "@/hooks/use-clubs";

interface TransferOwnershipDialogProps {
  readonly clubId: string;
  readonly clubTitle: string;
  readonly members: ClubMemberWithUser[];
  readonly currentUserId: string;
  readonly onSuccess: () => void;
}

export function TransferOwnershipDialog({ 
  clubId, 
  clubTitle, 
  members, 
  currentUserId,
  onSuccess 
}: TransferOwnershipDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const { toast } = useToast();

  // Фильтруем - показываем только обычных участников (не владельца)
  const eligibleMembers = members.filter(
    m => m.id !== currentUserId && m.role !== 'owner'
  );

  const handleTransfer = async () => {
    if (!selectedMemberId) {
      toast({
        title: "Ошибка",
        description: "Выберите нового владельца",
        variant: "destructive",
      });
      return;
    }

    const selectedMember = members.find(m => m.id === selectedMemberId);
    if (!selectedMember) return;

    const selectedMemberLabel = selectedMember.displayName ?? selectedMember.username;

    const confirmed = await modalConfirm({
      title: "Передача прав владельца",
      description:
        `Вы уверены, что хотите передать права владельца клуба "${clubTitle}" участнику ${selectedMemberLabel}?\n\n` +
        `После этого:\n` +
        `• ${selectedMemberLabel} станет владельцем клуба\n` +
        `• Вы станете обычным участником\n` +
        `• Вы сможете покинуть клуб\n\n` +
        `Это действие необратимо!`,
      confirmLabel: "Передать права",
      cancelLabel: "Отмена",
      variant: "destructive",
    });

    if (!confirmed) return;

    setIsTransferring(true);

    try {
      const response = await fetch(`/api/clubs/${clubId}/transfer-ownership`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ newOwnerId: selectedMemberId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to transfer ownership');
      }

      toast({
        title: "Права переданы",
        description: `${selectedMemberLabel} теперь владелец клуба`,
      });

      setOpen(false);
      onSuccess();
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Не удалось передать права",
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-white/10 text-white border-white/20 hover:bg-white/20"
        >
          <UserCog className="w-4 h-4 mr-2" />
          Передать права
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Передача прав владельца
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Предупреждение */}
          <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-900 dark:text-yellow-100">
                Внимание!
              </p>
              <p className="text-yellow-800 dark:text-yellow-200 mt-1">
                После передачи прав вы станете обычным участником и не сможете вернуть их обратно самостоятельно.
              </p>
            </div>
          </div>

          {/* Список участников */}
          <div>
            <span className="text-sm font-medium mb-2 block">
              Выберите нового владельца:
            </span>
            {eligibleMembers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                В клубе нет других участников для передачи прав
              </div>
            ) : (
              <ScrollArea className="h-[300px] border rounded-lg">
                <div className="p-2 space-y-2">
                  {eligibleMembers.map((member) => (
                    <button
                      key={member.id}
                      onClick={() => setSelectedMemberId(member.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        selectedMemberId === member.id
                          ? 'bg-primary/10 border-2 border-primary'
                          : 'hover:bg-muted border-2 border-transparent'
                      }`}
                    >
                      <Avatar className="h-10 w-10">
                        {member.avatar && <AvatarImage src={member.avatar} alt={member.username} />}
                      <AvatarFallback>
                          {(member.displayName ?? member.username)[0].toUpperCase()}
                      </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <p className="font-medium">{member.displayName ?? member.username}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {member.role === 'moderator' ? 'Модератор' : 'Участник'}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isTransferring}
          >
            Отмена
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedMemberId || isTransferring || eligibleMembers.length === 0}
          >
            {isTransferring ? 'Передаем...' : 'Передать права'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
