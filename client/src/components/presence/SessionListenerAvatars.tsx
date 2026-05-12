import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authFetch } from "@/lib/queryClient";
import { UserContextMenu } from "@/components/social/UserContextMenu";

interface SessionListener {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

interface SessionListenerAvatarsProps {
  sessionId: string;
  maxVisible?: number;
}

export function SessionListenerAvatars({ sessionId, maxVisible = 5 }: SessionListenerAvatarsProps) {
  const { data } = useQuery<{ listeners: SessionListener[] }>({
    queryKey: ["/api/reading-sessions", sessionId, "listeners"],
    queryFn: () => authFetch(`/api/reading-sessions/${sessionId}/listeners`).then(r => r.json()) as Promise<{ listeners: SessionListener[] }>,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const listeners = data?.listeners ?? [];
  if (listeners.length === 0) return null;

  const visible = listeners.slice(0, maxVisible);
  const overflow = listeners.length - visible.length;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visible.map((user) => (
          <UserContextMenu key={user.id} user={user} actions={["profile"]}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="cursor-pointer">
                  <Avatar className="h-7 w-7 border-2 border-background hover:z-10 hover:scale-110 transition-transform">
                    <AvatarImage src={user.avatar ?? undefined} alt={user.displayName ?? user.username} />
                    <AvatarFallback className="text-xs">
                      {(user.displayName ?? user.username).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {user.displayName ?? user.username}
              </TooltipContent>
            </Tooltip>
          </UserContextMenu>
        ))}
        {overflow > 0 && (
          <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}
