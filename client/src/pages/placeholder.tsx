import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Construction, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function PlaceholderPage({ title = "В разработке" }: { title?: string }) {
  return (
    <MainLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6 md:px-12 space-y-6">
        <div className="w-20 h-20 bg-secondary/50 rounded-full flex items-center justify-center animate-pulse">
           <Construction className="w-10 h-10 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-serif font-bold text-primary">{title}</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Эта страница является частью полного дизайн-пакета, но еще не реализована в текущем прототипе.
          </p>
        </div>
        <Link href="/">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" /> Вернуться на главную
          </Button>
        </Link>
      </div>
    </MainLayout>
  );
}
