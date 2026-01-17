import { Construction, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

interface ComingSoonOverlayProps {
  readonly children: React.ReactNode;
}

export function ComingSoonOverlay({ children }: ComingSoonOverlayProps) {
  return (
    <div className="relative">
      {children}
      <div className="fixed inset-0 bg-background/20 backdrop-blur-[1px] flex items-center justify-center z-50">
        <div className="text-center space-y-4 p-8 bg-background/90 rounded-2xl shadow-2xl border border-border/50">
          <Construction className="h-16 w-16 mx-auto text-amber-500" />
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Функционал в разработке
          </h2>
          <p className="text-lg text-muted-foreground max-w-md">
            Мы работаем над этим разделом. Скоро здесь появится что-то интересное!
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              На главную
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
