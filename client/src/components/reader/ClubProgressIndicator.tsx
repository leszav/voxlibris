import { useEffect, useState } from "react";
import { useReaderWebSocket } from "../../hooks/use-reader-websocket";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Progress } from "../ui/progress";
import { Users } from "lucide-react";

interface ClubProgressIndicatorProps {
  readonly clubId: string;
  readonly bookId: string;
}

interface MemberProgress {
  userId: string;
  userName: string;
  userAvatar?: string;
  progress: number;
  chapter: number;
}

function updateMemberProgress(prev: MemberProgress[], data: MemberProgress): MemberProgress[] {
  const index = prev.findIndex((m) => m.userId === data.userId);
  if (index >= 0) {
    const updated = [...prev];
    updated[index] = data;
    return updated;
  }
  return [...prev, data];
}

export function ClubProgressIndicator({ clubId, bookId }: ClubProgressIndicatorProps) {
  const [members, setMembers] = useState<MemberProgress[]>([]);

  const { on } = useReaderWebSocket({
    bookId,
    clubId,
    autoConnect: true,
  });

  useEffect(() => {
    if (!on) return;

    // Подписываемся на обновления прогресса участников
    const unsubscribe = on("member_progress", (data) => {
      const payload = data as MemberProgress;
      if (!payload?.userId) return;
      setMembers((prev) => updateMemberProgress(prev, payload));
    });

    return unsubscribe;
  }, [on]);

  if (members.length === 0) {
    return null;
  }

  return (
    <div className="border-t p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users className="w-4 h-4" />
        <span>Прогресс участников</span>
      </div>

      <div className="space-y-3 max-h-48 overflow-y-auto">
        {members.map((member) => (
          <div key={member.userId} className="space-y-1">
            <div className="flex items-center gap-2">
              <Avatar className="w-6 h-6">
                <AvatarImage src={member.userAvatar} />
                <AvatarFallback className="text-xs">
                  {member.userName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{member.userName}</p>
                <p className="text-xs text-muted-foreground">
                  Глава {member.chapter} • {member.progress}%
                </p>
              </div>
            </div>
            <Progress value={member.progress} className="h-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
