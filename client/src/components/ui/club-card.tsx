import { Badge } from "@/components/ui/badge";
import { Users, BookOpen, Mic, Lock } from "lucide-react";
import { Link } from "wouter";

function formatMemberCount(members: number, maxMembers: number): string {
  if (maxMembers > 0) return `${members}/${maxMembers}`;
  if (members > 0) return `${members}`;
  return "Открытый";
}

interface ClubCardProps {
  readonly id: string;
  readonly title: string;
  readonly bookTitle?: string;
  readonly author?: string;
  readonly coverUrl?: string;
  readonly bookCoverUrl?: string;
  readonly description?: string;
  readonly members: number;
  readonly maxMembers: number;
  readonly isLive?: boolean;
  readonly isPrivate?: boolean;
  readonly type?: "standard" | "premium" | "reader-led" | "reading_club";
  readonly tags?: string[];
}

export function ClubCard({
  id,
  title,
  bookTitle,
  author,
  coverUrl,
  bookCoverUrl,
  description,
  members,
  maxMembers,
  isLive,
  isPrivate,
  type = "standard",
  tags = [],
}: Readonly<ClubCardProps>) {
  return (
    <Link href={`/clubs/${id}`}>
      <div className="group relative bg-card rounded-xl border hover:border-accent/50 hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer h-full flex flex-col">
        <div className="relative aspect-[16/9] overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={bookTitle || title}
              className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <BookOpen className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
          {bookCoverUrl && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <img
                src={bookCoverUrl}
                alt={bookTitle || "Обложка книги"}
                className="h-[80%] w-auto object-contain drop-shadow-2xl opacity-90 group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          <div className="absolute top-3 left-3 flex gap-2">
            {isPrivate && (
              <Badge variant="secondary" className="bg-slate-800/90 text-white shadow-md flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Закрытый
              </Badge>
            )}
          </div>
          
          <div className="absolute top-3 right-3 flex gap-2">
            {isLive && (
              <Badge variant="destructive" className="animate-pulse shadow-lg">
                LIVE
              </Badge>
            )}
            {type === "reader-led" && (
              <Badge variant="secondary" className="bg-accent text-accent-foreground shadow-md">
                Клуб Чтеца
              </Badge>
            )}
            {type === "reading_club" && (
              <Badge variant="secondary" className="bg-green-500 text-white shadow-md">
                Тихое чтение
              </Badge>
            )}
             {type === "premium" && (
              <Badge variant="secondary" className="bg-amber-400 text-black shadow-md">
                Премиум
              </Badge>
            )}
          </div>
          
          <div className="absolute bottom-3 left-3 text-white">
            <h3 className="font-serif font-bold text-lg leading-tight line-clamp-1">{title}</h3>
            {bookTitle && author ? (
              <p className="text-sm text-white/80 line-clamp-1">{bookTitle} — {author}</p>
            ) : (
              <p className="text-sm text-white/60 italic line-clamp-1">Книга еще не выбрана</p>
            )}
          </div>
        </div>

        <div className="p-4 flex flex-col flex-1 gap-4">
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs font-normal">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="mt-auto flex items-center justify-between text-muted-foreground text-sm">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span>
                {formatMemberCount(members, maxMembers)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Mic className="h-4 w-4" />
              <span>{isLive ? "Читают сейчас" : "По расписанию"}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
