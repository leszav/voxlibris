import { useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, AtSign } from "lucide-react";

export type UserContextAction = "profile" | "mention";

interface UserContextMenuUser {
  id: string | number;
  username: string;
  displayName?: string | null;
}

interface UserContextMenuProps {
  user: UserContextMenuUser;
  actions: UserContextAction[];
  children: React.ReactNode;
  onMention?: (username: string) => void;
}

export function UserContextMenu({ user, actions, children, onMention }: UserContextMenuProps) {
  const [, navigate] = useLocation();

  if (actions.length === 0) {
    return <>{children}</>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-48 z-[200]">
        {actions.includes("profile") && (
          <DropdownMenuItem
            onClick={() => navigate(`/users/${user.id}`)}
            className="cursor-pointer"
          >
            <User className="mr-2 h-4 w-4" />
            Перейти к профилю
          </DropdownMenuItem>
        )}
        {actions.includes("profile") && actions.includes("mention") && (
          <DropdownMenuSeparator />
        )}
        {actions.includes("mention") && (
          <DropdownMenuItem
            onClick={() => onMention?.(user.username)}
            className="cursor-pointer"
          >
            <AtSign className="mr-2 h-4 w-4" />
            Упомянуть @{user.displayName || user.username}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
