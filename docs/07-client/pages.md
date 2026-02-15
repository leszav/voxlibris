# Страницы

## Обзор

В этом разделе описаны страницы клиентской части приложения VoxLibris. Каждая страница представляет собой отдельный маршрут приложения и может содержать несколько компонентов.

## Структура директории

Страницы находятся в директории `client/src/pages/`:

```
client/src/pages/
├── index.tsx
├── login.tsx
├── signup.tsx
├── dashboard/
│   ├── index.tsx
│   ├── profile.tsx
│   ├── clubs.tsx
│   ├── books.tsx
│   └── reading-history.tsx
├── clubs/
│   ├── index.tsx
│   ├── list.tsx
│   ├── create.tsx
│   ├── [id].tsx
│   └── [id]/
│       ├── books.tsx
│       ├── members.tsx
│       ├── sessions.tsx
│       └── settings.tsx
├── books/
│   ├── index.tsx
│   ├── library.tsx
│   ├── reader/
│   │   ├── [id].tsx
│   │   └── player.tsx
│   └── upload.tsx
├── sessions/
│   ├── index.tsx
│   ├── active.tsx
│   ├── history.tsx
│   └── [id].tsx
├── notifications.tsx
└── settings.tsx
```

## Главная страница

### client/src/pages/index.tsx

Главная страница приложения, представляющая собой точку входа для пользователей. Содержит информацию о платформе, преимущества и призыв к действию.

```tsx
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";

const HomePage = () => {
  const { user } = useAuthStore();

  return (
    <div className="container mx-auto py-12">
      <section className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">Welcome to VoxLibris</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Join our community of readers and experience social reading like never before.
          Listen to books read by professional narrators or fellow community members.
        </p>
        
        {!user && (
          <div className="flex justify-center gap-4">
            <Button asChild>
              <Link to="/signup">Join Now</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/login">Login</Link>
            </Button>
          </div>
        )}
        
        {user && (
          <Button asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        )}
      </section>
      
      <section className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="text-center p-6">
          <h3 className="text-xl font-semibold mb-2">Social Reading</h3>
          <p className="text-muted-foreground">
            Join clubs and reading sessions with other members of our community.
          </p>
        </div>
        
        <div className="text-center p-6">
          <h3 className="text-xl font-semibold mb-2">Professional Narrators</h3>
          <p className="text-muted-foreground">
            Listen to books read by professional narrators and community members.
          </p>
        </div>
        
        <div className="text-center p-6">
          <h3 className="text-xl font-semibold mb-2">Multiple Formats</h3>
          <p className="text-muted-foreground">
            Support for EPUB, FB2, and audio formats for your reading pleasure.
          </p>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
```

## Страницы аутентификации

### client/src/pages/login.tsx

Страница входа пользователя в систему:

```tsx
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/forms/login-form";

const LoginPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome Back</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <LoginForm />
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
          <Link to="/" className="text-sm text-primary hover:underline">
            Back to Home
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default LoginPage;
```

### client/src/pages/signup.tsx

Страница регистрации нового пользователя:

```tsx
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { SignupForm } from "@/components/forms/signup-form";

const SignupPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            Enter your information to create an account
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <SignupForm />
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Login
            </Link>
          </p>
          <Link to="/" className="text-sm text-primary hover:underline">
            Back to Home
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
};

export default SignupPage;
```

## Страницы дашборда

### client/src/pages/dashboard/index.tsx

Главная страница дашборда пользователя:

```tsx
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { useClubs } from "@/hooks/use-clubs";
import { ClubCard } from "@/components/club/club-card";

const DashboardPage = () => {
  const { user } = useAuthStore();
  const { clubs, isLoading } = useClubs();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.name}!
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Your Clubs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {clubs?.map(club => (
                  <ClubCard 
                    key={club.id} 
                    club={club} 
                    onView={(club) => {/* Navigate to club */}} 
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" asChild>
                <Link to="/clubs/create">Create New Club</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link to="/clubs">Browse Clubs</Link>
              </Button>
              <Button className="w-full" variant="outline" asChild>
                <Link to="/books/upload">Upload Book</Link>
              </Button>
            </CardContent>
          </Card>
          
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Reading Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Books Read:</span>
                  <span className="font-medium">12</span>
                </div>
                <div className="flex justify-between">
                  <span>Clubs Joined:</span>
                  <span className="font-medium">{clubs?.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sessions Attended:</span>
                  <span className="font-medium">24</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
```

## Страницы клубов

### client/src/pages/clubs/list.tsx

Страница со списком публичных клубов:

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ClubCard } from "@/components/club/club-card";
import { useClubs } from "@/hooks/use-clubs";

const ClubsListPage = () => {
  const { clubs, isLoading } = useClubs({ type: 'public' });
  const [searchTerm, setSearchTerm] = useState('');

  if (isLoading) {
    return <div>Loading clubs...</div>;
  }

  const filteredClubs = clubs?.filter(club => 
    club.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    club.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">All Clubs</h1>
        <p className="text-muted-foreground">
          Browse and join public clubs
        </p>
      </div>
      
      <div className="mb-6">
        <Input
          placeholder="Search clubs..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClubs?.map(club => (
          <ClubCard 
            key={club.id} 
            club={club} 
            onJoin={(club) => {/* Join club logic */}}
            onView={(club) => {/* Navigate to club page */}}
          />
        ))}
      </div>
    </div>
  );
};

export default ClubsListPage;
```

### client/src/pages/clubs/[id].tsx

Страница деталей клуба:

```tsx
import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useClub } from "@/hooks/use-club";
import { BookCard } from "@/components/book/book-card";
import { ClubMember } from "@/components/club/club-member";

const ClubDetailPage = () => {
  const { id } = useParams();
  const { club, books, members, sessions, isLoading } = useClub(Number(id));
  const [activeTab, setActiveTab] = useState('books');

  if (isLoading) {
    return <div>Loading club...</div>;
  }

  if (!club) {
    return <div>Club not found</div>;
  }

  return (
    <div className="container py-8">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">{club.name}</h1>
        <div className="flex gap-2">
          {club.isMember && (
            <Button asChild>
              <Link to={`/clubs/${club.id}/sessions`}>Join Session</Link>
            </Button>
          )}
          {club.isOwner && (
            <Button variant="outline" asChild>
              <Link to={`/clubs/${club.id}/settings`}>Settings</Link>
            </Button>
          )}
        </div>
      </div>
      
      <Card className="mb-6">
        <CardContent className="py-6">
          <p className="text-muted-foreground">{club.description}</p>
          <div className="mt-4 flex gap-4 text-sm">
            <span>{club.memberCount} members</span>
            <span>{sessions?.length || 0} sessions</span>
          </div>
        </CardContent>
      </Card>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="books">Books</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>
        
        <TabsContent value="books">
          <Card>
            <CardHeader>
              <CardTitle>Books in {club.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {books?.map(book => (
                  <BookCard 
                    key={book.id} 
                    book={book} 
                    onRead={(book) => {/* Open book reader */}}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="members">
          <Card>
            <CardHeader>
              <CardTitle>Club Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {members?.map(member => (
                  <ClubMember 
                    key={member.id} 
                    member={member} 
                    role={member.role}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Recent Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {/* List of recent sessions */}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClubDetailPage;
```

## Страницы книг

### client/src/pages/books/library.tsx

Страница личной библиотеки пользователя:

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookCard } from "@/components/book/book-card";
import { useBooks } from "@/hooks/use-books";

const LibraryPage = () => {
  const { books, isLoading } = useBooks();
  const [searchTerm, setSearchTerm] = useState('');

  if (isLoading) {
    return <div>Loading books...</div>;
  }

  const filteredBooks = books?.filter(book => 
    book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    book.author.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container py-8">
      <div className="mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Your Library</h1>
        <Button asChild>
          <a href="/books/upload">Upload Book</a>
        </Button>
      </div>
      
      <div className="mb-6">
        <Input
          placeholder="Search books..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredBooks?.map(book => (
          <BookCard 
            key={book.id} 
            book={book} 
            onRead={(book) => {/* Open book reader */}}
            onDownload={(book) => {/* Download book */}}
          />
        ))}
      </div>
    </div>
  );
};

export default LibraryPage;
```

## Страницы сессий чтения

### client/src/pages/sessions/active.tsx

Страница активной сессии чтения:

```tsx
import { useParams, Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/reading-session/progress-bar";
import { ChatPanel } from "@/components/reading-session/chat-panel";
import { useSession } from "@/hooks/use-session";
import { useWebSocket } from "@/hooks/use-websocket";

const ActiveSessionPage = () => {
  const { id } = useParams();
  const { session, progress, updateProgress } = useSession(Number(id));
  const { sendMessage, messages, reactions } = useWebSocket(`/session/${id}`);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && session?.audioUrl) {
      audioRef.current.src = session.audioUrl;
    }
  }, [session]);

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleProgressChange = (value: number) => {
    setCurrentPosition(value);
    updateProgress(value);
    
    if (audioRef.current) {
      audioRef.current.currentTime = value * (audioRef.current.duration || 0);
    }
  };

  if (!session) {
    return <div>Session not found</div>;
  }

  return (
    <div className="container py-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{session.title}</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Hosted by {session.host.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  • {session.participants.length} participants
                </span>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="mb-6">
                <div className="aspect-video bg-gray-200 rounded-lg mb-4 flex items-center justify-center">
                  {session.book.coverUrl ? (
                    <img 
                      src={session.book.coverUrl} 
                      alt={session.book.title} 
                      className="object-contain max-h-full max-w-full"
                    />
                  ) : (
                    <span>No cover available</span>
                  )}
                </div>
                
                <div className="flex items-center gap-4 mb-4">
                  <Button onClick={handlePlayPause}>
                    {isPlaying ? 'Pause' : 'Play'}
                  </Button>
                  
                  <Button variant="outline">
                    Send Reaction
                  </Button>
                </div>
                
                <div className="mb-2 flex justify-between text-sm">
                  <span>Progress: {Math.round(currentPosition * 100)}%</span>
                  <span>Chapter {session.currentChapter}</span>
                </div>
                
                <ProgressBar 
                  value={currentPosition} 
                  onSeek={handleProgressChange} 
                />
              </div>
              
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Current Chapter</h3>
                <p className="text-muted-foreground whitespace-pre-line">
                  {session.currentChapterContent}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div>
          <ChatPanel 
            messages={messages} 
            onSendMessage={sendMessage} 
            participants={session.participants}
          />
        </div>
      </div>
      
      <audio 
        ref={audioRef} 
        onTimeUpdate={(e) => {
          if (e.currentTarget.duration) {
            setCurrentPosition(e.currentTarget.currentTime / e.currentTarget.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
      />
    </div>
  );
};

export default ActiveSessionPage;
```

## Маршрутизация

### client/src/main.tsx

Конфигурация маршрутизации в основном файле:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Route, Switch } from 'wouter';
import App from './App.tsx';
import HomePage from './pages/index.tsx';
import LoginPage from './pages/login.tsx';
import SignupPage from './pages/signup.tsx';
import DashboardPage from './pages/dashboard/index.tsx';
import ClubsListPage from './pages/clubs/list.tsx';
import ClubDetailPage from './pages/clubs/[id].tsx';
import LibraryPage from './pages/books/library.tsx';
import ActiveSessionPage from './pages/sessions/active.tsx';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/signup" component={SignupPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/clubs" component={ClubsListPage} />
        <Route path="/clubs/:id" component={ClubDetailPage} />
        <Route path="/books/library" component={LibraryPage} />
        <Route path="/sessions/active/:id" component={ActiveSessionPage} />
        {/* Other routes */}
      </Switch>
    </App>
  </React.StrictMode>,
);
```

## Хуки для страниц

Для управления данными на страницах используются специальные хуки:

```tsx
// client/src/hooks/use-clubs.ts
import { useQuery } from 'react-query';
import { getClubs } from '@/services/club-service';

export const useClubs = (options = {}) => {
  return useQuery(
    ['clubs', options],
    () => getClubs(options),
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
    }
  );
};
```

## Рекомендации

1. Используйте семантические имена файлов для страниц
2. Следите за загрузкой данных и состоянием загрузки
3. Обрабатывайте ошибки при получении данных
4. Используйте React Query или Zustand для управления состоянием
5. Проверяйте права доступа к страницам
6. Используйте SEO-дружественные заголовки и метаданные
7. Покрывайте страницы тестами
8. Следите за доступностью интерфейса
9. Оптимизируйте производительность страниц
10. Обновляйте документацию при изменении страниц