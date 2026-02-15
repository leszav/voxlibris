# Компоненты

## Обзор

В этом разделе описаны переиспользуемые UI-компоненты клиентской части приложения VoxLibris.

## Структура директории

Компоненты находятся в директории `client/src/components/`:

```
client/src/components/
├── ui/
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── label.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   └── ...
├── layout/
│   ├── header.tsx
│   ├── sidebar.tsx
│   ├── footer.tsx
│   └── ...
├── forms/
│   ├── login-form.tsx
│   ├── signup-form.tsx
│   ├── club-form.tsx
│   └── ...
├── book/
│   ├── book-card.tsx
│   ├── book-player.tsx
│   ├── book-reader.tsx
│   └── ...
├── club/
│   ├── club-card.tsx
│   ├── club-member.tsx
│   ├── club-invite.tsx
│   └── ...
├── reading-session/
│   ├── session-controls.tsx
│   ├── progress-bar.tsx
│   ├── chat-panel.tsx
│   └── ...
└── shared/
    ├── avatar.tsx
    ├── badge.tsx
    ├── tooltip.tsx
    └── ...
```

## UI Компоненты

### Button

Простой кнопочный компонент, построенный на основе Radix UI:

```tsx
// client/src/components/ui/button.tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
```

### Card

Компонент карточки для группировки связанных элементов:

```tsx
// client/src/components/ui/card.tsx
import { cn } from "@/lib/utils";

const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    )}
    {...props}
  />
);

const CardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
);

const CardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
);

const CardDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
);

const CardContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("p-6 pt-0", className)} {...props} />
);

const CardFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center p-6 pt-0", className)} {...props} />
);
```

## Layout Компоненты

### Header

Шапка приложения с навигацией:

```tsx
// client/src/components/layout/header.tsx
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";

const Header = () => {
  const { user, logout } = useAuthStore();

  return (
    <header className="border-b">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/" className="text-xl font-bold">
          VoxLibris
        </Link>
        
        <nav className="hidden md:flex items-center gap-4">
          <Link to="/clubs" className="text-sm font-medium">
            Clubs
          </Link>
          <Link to="/books" className="text-sm font-medium">
            Books
          </Link>
        </nav>
        
        {user ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">{user.name}</span>
            <Button onClick={logout} variant="outline" size="sm">
              Logout
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Link to="/login">Login</Link>
            </Button>
            <Button size="sm">
              <Link to="/signup">Sign Up</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};
```

## Form Компоненты

### LoginForm

Форма входа пользователя:

```tsx
// client/src/components/forms/login-form.tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/store";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

const LoginForm = () => {
  const { login } = useAuthStore();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormData) => {
    login(data.email, data.password);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          {...register("email")}
          placeholder="name@example.com"
        />
        {errors.email && (
          <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>
        )}
      </div>
      
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          {...register("password")}
          placeholder="Enter your password"
        />
        {errors.password && (
          <p className="text-sm text-red-500 mt-1">{errors.password.message}</p>
        )}
      </div>
      
      <Button type="submit" className="w-full">
        Sign In
      </Button>
    </form>
  );
};
```

## Book Компоненты

### BookCard

Карточка книги с информацией и действиями:

```tsx
// client/src/components/book/book-card.tsx
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Book } from "@/types/book";

interface BookCardProps {
  book: Book;
  onRead?: (book: Book) => void;
  onDownload?: (book: Book) => void;
}

const BookCard = ({ book, onRead, onDownload }: BookCardProps) => {
  return (
    <Card className="overflow-hidden">
      {book.coverUrl && (
        <div className="h-48 bg-gray-200">
          <img 
            src={book.coverUrl} 
            alt={book.title} 
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <CardHeader>
        <CardTitle>{book.title}</CardTitle>
        <p className="text-sm text-muted-foreground">{book.author}</p>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm">{book.description}</p>
        <div className="mt-2 flex gap-2">
          <Badge variant="secondary">{book.format}</Badge>
          {book.tags?.map(tag => (
            <Badge key={tag} variant="outline">{tag}</Badge>
          ))}
        </div>
      </CardContent>
      
      <CardFooter className="flex gap-2">
        {onRead && (
          <Button onClick={() => onRead(book)}>Read Now</Button>
        )}
        {onDownload && (
          <Button variant="outline" onClick={() => onDownload(book)}>
            Download
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
```

## Club Компоненты

### ClubCard

Карточка клуба с информацией и действиями:

```tsx
// client/src/components/club/club-card.tsx
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Club } from "@/types/club";

interface ClubCardProps {
  club: Club;
  onJoin?: (club: Club) => void;
  onView?: (club: Club) => void;
}

const ClubCard = ({ club, onJoin, onView }: ClubCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{club.name}</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={club.isPublic ? "default" : "secondary"}>
            {club.isPublic ? "Public" : "Private"}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {club.memberCount} members
          </span>
        </div>
      </CardHeader>
      
      <CardContent>
        <p className="text-sm">{club.description}</p>
      </CardContent>
      
      <CardFooter className="flex gap-2">
        {onView && (
          <Button variant="outline" onClick={() => onView(club)}>
            View Details
          </Button>
        )}
        {onJoin && !club.isMember && (
          <Button onClick={() => onJoin(club)}>Join Club</Button>
        )}
        {onView && club.isMember && (
          <Button onClick={() => onView(club)}>Open Club</Button>
        )}
      </CardFooter>
    </Card>
  );
};
```

## Reading Session Компоненты

### ProgressBar

Компонент для отображения прогресса чтения:

```tsx
// client/src/components/reading-session/progress-bar.tsx
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number; // 0 to 1
  max?: number;
  className?: string;
  onSeek?: (value: number) => void;
}

const ProgressBar = ({ 
  value, 
  max = 1, 
  className, 
  onSeek 
}: ProgressBarProps) => {
  const percentage = Math.min(100, Math.max(0, value * 100));
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const width = rect.width;
    const newValue = Math.min(max, Math.max(0, (offsetX / width) * max));
    
    onSeek(newValue);
  };

  return (
    <div 
      className={cn("relative w-full h-2 bg-secondary rounded-full overflow-hidden cursor-pointer", className)}
      onMouseDown={handleMouseDown}
    >
      <div 
        className="absolute top-0 left-0 h-full bg-primary transition-all"
        style={{ width: `${percentage}%` }}
      />
      <div 
        className="absolute top-1/2 w-4 h-4 -mt-2 -ml-2 bg-primary rounded-full border border-white shadow-sm"
        style={{ left: `${percentage}%` }}
      />
    </div>
  );
};
```

## Shared Компоненты

### Avatar

Компонент для отображения аватара пользователя:

```tsx
// client/src/components/shared/avatar.tsx
import { cn } from "@/lib/utils";

interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  className?: string;
}

const Avatar = ({ src, alt, fallback, className }: AvatarProps) => {
  return (
    <div className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}>
      {src ? (
        <img 
          src={src} 
          alt={alt || "Avatar"} 
          className="aspect-square h-full w-full"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
          {fallback || "?"}
        </div>
      )}
    </div>
  );
};

const AvatarImage = ({ src, alt }: { src: string; alt?: string }) => (
  <img src={src} alt={alt || ""} className="aspect-square h-full w-full" />
);

const AvatarFallback = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full w-full items-center justify-center rounded-full bg-muted">
    {children}
  </div>
);
```

## Использование компонентов

### Импорт компонентов

Компоненты импортируются по их пути относительно директории `components`:

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClubCard } from "@/components/club/club-card";
import { LoginForm } from "@/components/forms/login-form";
```

### Принципы использования

1. Компоненты строятся с использованием Tailwind CSS для стилизации
2. Используется библиотека `class-variance-authority` для управления вариантами
3. Компоненты типизированы с использованием TypeScript
4. Используются компоненты Radix UI для доступности и гибкости

## Создание новых компонентов

При создании новых компонентов следуйте этим принципам:

1. Помещайте компоненты в соответствующую поддиректорию в `client/src/components/`
2. Используйте TypeScript для типизации пропсов
3. Применяйте стили с помощью Tailwind CSS
4. Следите за доступностью (a11y) компонентов
5. Пишите чистый и понятный код
6. Добавляйте JSDoc комментарии для сложных компонентов

## Рекомендации

1. Используйте компоненты UI для согласованности интерфейса
2. Переиспользуйте компоненты при возможности
3. Следите за размером компонентов и производительностью
4. Используйте React.memo для оптимизации компонентов
5. Покрывайте сложные компоненты тестами
6. Обновляйте документацию при изменении интерфейсов компонентов