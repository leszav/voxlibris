import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComingSoonOverlay } from "@/components/ui/coming-soon-overlay";
import { Mic, Star, Trophy, Play, Headphones, Heart } from "lucide-react";
import soundWaveBg from "@assets/generated_images/abstract_sound_wave_visualization_background.png";

// Mock Data for Readers
const TOP_READERS = [
  {
    id: 1,
    name: "Анна Смирнова",
    bio: "Профессиональный диктор, люблю русскую классику и поэзию Серебряного века.",
    rating: 4.9,
    followers: 1240,
    hoursRead: 342,
    currentBook: "Анна Каренина",
    isLive: true,
    tags: ["Классика", "Поэзия"],
    avatar: "АС"
  },
  {
    id: 2,
    name: "Михаил Романов",
    bio: "Читаю фантастику и триллеры. Люблю создавать атмосферу голосом.",
    rating: 4.8,
    followers: 890,
    hoursRead: 215,
    currentBook: null,
    isLive: false,
    tags: ["Фантастика", "Триллер"],
    avatar: "МР"
  },
  {
    id: 3,
    name: "Елена Темникова",
    bio: "Читаем сказки на ночь и добрые истории для всей семьи.",
    rating: 5.0,
    followers: 2100,
    hoursRead: 560,
    currentBook: "Маленький принц",
    isLive: true,
    tags: ["Детское", "Сказки"],
    avatar: "ЕТ"
  },
  {
    id: 4,
    name: "Дмитрий Ковалев",
    bio: "Исторические романы и биографии великих людей.",
    rating: 4.7,
    followers: 450,
    hoursRead: 120,
    currentBook: null,
    isLive: false,
    tags: ["История", "Биографии"],
    avatar: "ДК"
  }
];

export default function Readers() {
  return (
    <MainLayout>
      <ComingSoonOverlay>
      {/* Hero Section */}
      <div className="relative h-64 w-full overflow-hidden bg-stone-900">
        <div className="absolute inset-0 opacity-40">
           <img src={soundWaveBg} alt="Sound Wave" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900 via-stone-900/80 to-transparent" />
        
        <div className="container relative h-full flex flex-col justify-center px-6 md:px-12 space-y-4">
          <Badge variant="secondary" className="w-fit bg-amber-500/10 text-amber-500 border-amber-500/20">
            <Trophy className="w-3.5 h-3.5 mr-2" />
            Зал Славы VoxLibris
          </Badge>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-white">Лучшие Чтецы</h1>
          <p className="text-stone-300 max-w-xl text-lg">
            Познакомьтесь с голосами, которые оживляют истории. Подписывайтесь, слушайте и поддерживайте любимых авторов.
          </p>
        </div>
      </div>

      <div className="container py-12 px-6 md:px-12">
        <Tabs defaultValue="all" className="space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <TabsList>
              <TabsTrigger value="all">Все чтецы</TabsTrigger>
              <TabsTrigger value="live">Сейчас в эфире</TabsTrigger>
              <TabsTrigger value="rising">Новички</TabsTrigger>
            </TabsList>
            
            <div className="flex gap-2">
               <Button variant="outline">Стать чтецом</Button>
            </div>
          </div>

          <TabsContent value="all" className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {TOP_READERS.map((reader) => (
                <ReaderCard key={reader.id} reader={reader} />
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="live">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {TOP_READERS.filter(r => r.isLive).map((reader) => (
                <ReaderCard key={reader.id} reader={reader} />
              ))}
              {TOP_READERS.filter(r => r.isLive).length === 0 && (
                <div className="col-span-full py-12 text-center text-muted-foreground">
                  Сейчас нет активных эфиров. Попробуйте позже.
                </div>
              )}
            </div>
          </TabsContent>
          
           <TabsContent value="rising">
             <div className="py-12 text-center text-muted-foreground bg-secondary/20 rounded-xl border border-dashed">
                Здесь скоро появятся восходящие звезды платформы.
             </div>
          </TabsContent>
        </Tabs>
      </div>
      </ComingSoonOverlay>
    </MainLayout>
  );
}

function ReaderCard({ reader }: { reader: typeof TOP_READERS[0] }) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-6 space-y-6">
        <div className="flex justify-between items-start">
          <div className="flex gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-background shadow-sm">
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
                  {reader.avatar}
                </AvatarFallback>
              </Avatar>
              {reader.isLive && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 border-2 border-white"></span>
                </span>
              )}
            </div>
            <div>
              <h3 className="font-bold text-lg leading-none mb-1">{reader.name}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span className="font-medium text-foreground">{reader.rating}</span>
                <span>•</span>
                <span>{reader.followers} подписчиков</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500">
             <Heart className="w-5 h-5" />
          </Button>
        </div>

        <p className="text-sm text-muted-foreground line-clamp-2">
          {reader.bio}
        </p>

        <div className="flex flex-wrap gap-2">
          {reader.tags.map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs font-normal">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="pt-2">
          {reader.isLive ? (
            <Button className="w-full bg-red-600 hover:bg-red-700 text-white shadow-sm gap-2">
              <Mic className="w-4 h-4" /> Слушать сейчас
            </Button>
          ) : (
             <Button variant="outline" className="w-full gap-2">
              <Headphones className="w-4 h-4" /> Профиль
            </Button>
          )}
          {reader.currentBook && reader.isLive && (
             <p className="text-xs text-center text-red-600 mt-2 font-medium flex items-center justify-center gap-1">
               <Play className="w-3 h-3 fill-current" /> Читает: {reader.currentBook}
             </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
