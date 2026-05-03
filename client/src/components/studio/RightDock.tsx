import { useState } from "react";
import { X, BellOff, Heart, Flame, ThumbsUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  user: string;
  text: string;
  time: string;
  isReader?: boolean;
}

interface Listener {
  id: string;
  name: string;
  isMod?: boolean;
}

interface RightDockProps {
  isOpen: boolean;
  onClose: () => void;
  listenerCount: number;
  unreadCount?: number;
  onSendReaction?: (emoji: string) => void;
  // In a real implementation these would come from socket/query
  messages?: ChatMessage[];
  listeners?: Listener[];
}

const QUICK_REACTIONS = [
  { emoji: "❤️",  label: "Сердце",       Icon: Heart },
  { emoji: "🔥",  label: "Огонь",        Icon: Flame },
  { emoji: "👏",  label: "Аплодисменты", Icon: ThumbsUp },
] as const;

const MOCK_MESSAGES: ChatMessage[] = [
  { id: "m1", user: "Алиса",  text: "Атмосфера просто потрясающая!", time: "2м" },
  { id: "m2", user: "Борис",  text: "Обожаю эту главу.",             time: "1м" },
  { id: "m3", user: "Евгений",text: "Как вы читаете диалоги — это нечто.", time: "Сейчас" },
];

const MOCK_LISTENERS: Listener[] = [
  { id: "u1", name: "Алиса",   isMod: true },
  { id: "u2", name: "Борис"  },
  { id: "u3", name: "Евгений" },
];

export function RightDock({
  isOpen,
  onClose,
  listenerCount,
  unreadCount = 0,
  onSendReaction,
  messages = MOCK_MESSAGES,
  listeners = MOCK_LISTENERS,
}: Readonly<RightDockProps>) {
  const [muted, setMuted] = useState(false);
  const [composerText, setComposerText] = useState("");

  if (!isOpen) return null;

  const handleSendMessage = () => {
    // In real implementation, send via socket
    setComposerText("");
  };

  return (
    <aside
      className={cn(
        "w-80 xl:w-96 shrink-0 border-l border-border bg-card flex flex-col",
        "animate-in slide-in-from-right-4 duration-220"
      )}
    >
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-border shrink-0">
        <span className="font-medium text-sm text-foreground">Клубный чат</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", muted && "text-amber-500")}
            onClick={() => setMuted((v) => !v)}
            title={muted ? "Включить уведомления" : "Без звука"}
          >
            <BellOff className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            title="Закрыть"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="mx-3 mt-2 mb-0 h-8 bg-muted/60 shrink-0">
          <TabsTrigger value="chat" className="flex-1 text-xs h-7 gap-1.5">
            Чат
            {unreadCount > 0 && (
              <Badge className="h-4 min-w-4 px-1 text-[10px] bg-amber-500 text-white border-none">
                {unreadCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="listeners" className="flex-1 text-xs h-7 gap-1.5">
            Слушатели
            <Badge variant="outline" className="h-4 min-w-4 px-1 text-[10px] border-border">
              {listenerCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="reactions" className="flex-1 text-xs h-7">
            Реакции
          </TabsTrigger>
        </TabsList>

        {/* Chat tab */}
        <TabsContent value="chat" className="flex flex-col flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2.5",
                    msg.isReader && "border-l-2 border-amber-500/40 pl-2 -ml-2"
                  )}
                >
                  <Avatar className="w-6 h-6 shrink-0 mt-0.5">
                    <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                      {msg.user[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{msg.user}</span>
                      <span className="text-[11px] text-muted-foreground">{msg.time}</span>
                    </div>
                    <p className="text-sm text-foreground/90 leading-snug break-words">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Composer */}
          <div className="p-3 border-t border-border shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                placeholder="Написать в чат…"
                className="flex-1 min-w-0 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/40"
              />
              <Button
                size="sm"
                className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white border-none h-8 px-3"
                onClick={handleSendMessage}
                disabled={!composerText.trim()}
              >
                ↵
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Listeners tab */}
        <TabsContent value="listeners" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <ScrollArea className="h-full px-3 py-2">
            <div className="space-y-1">
              {listeners.map((l) => (
                <div key={l.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-muted/60">
                  <Avatar className="w-7 h-7 shrink-0">
                    <AvatarFallback className="text-xs bg-muted text-muted-foreground">
                      {l.name[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-foreground flex-1 truncate">{l.name}</span>
                  {l.isMod && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 px-1 h-4">
                      mod
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Reactions tab */}
        <TabsContent value="reactions" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
          <div className="p-4 space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Быстрые реакции</p>
              <div className="flex gap-2">
                {QUICK_REACTIONS.map(({ emoji, label }) => (
                  <Button
                    key={emoji}
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-border hover:border-amber-500/40 hover:bg-amber-500/5 text-sm"
                    onClick={() => onSendReaction?.(emoji)}
                    title={label}
                  >
                    <span>{emoji}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Лента реакций</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="text-muted-foreground/60 text-xs">Реакции слушателей появятся здесь</p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
