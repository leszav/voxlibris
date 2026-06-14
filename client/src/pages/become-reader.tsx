import { Link } from "wouter";
import { useState } from "react";
import { BookOpen, DollarSign, Mic, TrendingUp, Users } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import studioBg from "@assets/generated_images/professional_home_recording_studio_setup.png";

export default function BecomeReader() {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setIsSubmitting(true);
    setSubmitResult(null);
    try {
      await apiRequest("/api/v1/feedback/reader-application", {
        method: "POST",
        body: JSON.stringify({
          firstName: String(formData.get("firstName") || ""),
          lastName: String(formData.get("lastName") || ""),
          email: String(formData.get("email") || ""),
          experience: String(formData.get("experience") || ""),
          demo: String(formData.get("demo") || ""),
        }),
      });
      form.reset();
      setSubmitResult({
        type: "success",
        message: "Заявка успешно отправлена. Команда VoxLibris рассмотрит её и свяжется с вами.",
      });
      toast({
        title: "Заявка отправлена",
        description: "Спасибо! Команда VoxLibris рассмотрит заявку и свяжется с вами.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Попробуйте позже.";
      setSubmitResult({
        type: "error",
        message: `Заявку не удалось отправить. ${message}`,
      });
      toast({
        title: "Не удалось отправить заявку",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MainLayout>
      <section className="relative min-h-[520px] overflow-hidden">
        <img src={studioBg} alt="Домашняя студия для чтения" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-stone-900/55" />

        <div className="container relative flex min-h-[520px] items-center px-6 py-16 md:px-12">
          <div className="max-w-3xl space-y-6">
            <Badge className="border-amber-400/30 bg-amber-400/15 text-amber-100 hover:bg-amber-400/20">
              <Mic className="mr-2 h-3.5 w-3.5" />
              Клубы чтецов VoxLibris
            </Badge>
            <h1 className="font-serif text-4xl font-bold leading-tight text-white md:text-6xl">
              Ваш голос может <span className="text-amber-300">оживить историю</span>
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-stone-200 md:text-xl">
              Станьте чтецом VoxLibris, создавайте свои клубы, собирайте аудиторию и делитесь живым чтением с теми, кто любит слушать книги.
            </p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button size="lg" className="border-none bg-amber-600 text-white hover:bg-amber-700" asChild>
                <a href="#reader-application">Подать заявку</a>
              </Button>
              <Button size="lg" variant="outline" className="border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white" asChild>
                <Link href="/clubs">Мои клубы</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="container space-y-16 px-6 py-16 md:px-12 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-serif text-3xl font-bold md:text-4xl">Почему стоит стать чтецом</h2>
          <p className="mt-4 text-lg leading-8 text-muted-foreground">
            VoxLibris помогает превратить любовь к книгам и выразительному чтению в живое сообщество вокруг вашего голоса.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<Users className="h-7 w-7 text-amber-500" />}
            title="Своя аудитория"
            description="Создавайте клубы, приглашайте слушателей и собирайте вокруг книг людей, которым близок ваш тембр и стиль чтения."
          />
          <FeatureCard
            icon={<DollarSign className="h-7 w-7 text-emerald-500" />}
            title="Монетизация"
            description="Платные клубы и записи будут подключаться отдельным этапом, а сейчас можно готовить аудиторию и формат чтений."
          />
          <FeatureCard
            icon={<TrendingUp className="h-7 w-7 text-blue-500" />}
            title="Профессиональный рост"
            description="Пробуйте жанры, собирайте обратную связь и развивайте узнаваемую манеру чтения внутри книжного сообщества."
          />
        </div>

        <div id="reader-application" className="grid gap-8 rounded-2xl border bg-muted/30 p-6 md:grid-cols-[1fr_360px] md:p-10">
          <Card className="border-border/70 shadow-sm">
            <CardContent className="p-6 md:p-8">
              <div className="mb-6 space-y-2">
                <h2 className="font-serif text-2xl font-bold md:text-3xl">Заявка чтеца</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Расскажите о себе и приложите ссылку на демо — это поможет команде понять ваш формат и подобрать первые сценарии чтения.
                </p>
              </div>
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Имя</Label>
                    <Input id="firstName" name="firstName" placeholder="Анна" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Фамилия</Label>
                    <Input id="lastName" name="lastName" placeholder="Петрова" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" placeholder="reader@example.com" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="experience">Опыт чтения</Label>
                  <Textarea id="experience" name="experience" rows={4} placeholder="Расскажите о жанрах, опыте выступлений, подкастах или чтении вслух." required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="demo">Ссылка на демо</Label>
                  <Input id="demo" name="demo" placeholder="YouTube, облако или аудиофайл" required />
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={isSubmitting}>
                  {isSubmitting ? "Отправляем..." : "Отправить заявку"}
                </Button>
                {submitResult ? (
                  <div
                    className={submitResult.type === "success"
                      ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200"}
                    role="status"
                    aria-live="polite"
                  >
                    {submitResult.message}
                  </div>
                ) : null}
              </form>
            </CardContent>
          </Card>

          <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/20">
            <CardContent className="space-y-5 p-6">
              <BookOpen className="h-8 w-8 text-amber-600" />
              <h3 className="text-xl font-bold">Советы для демо</h3>
              <ul className="space-y-3 text-sm leading-6 text-muted-foreground">
                <TipItem>Запишите 2–3 минуты чтения без музыки и лишней обработки.</TipItem>
                <TipItem>Выберите фрагмент с диалогом или эмоциональным переходом.</TipItem>
                <TipItem>Проверьте, чтобы голос был слышен ровно и без сильного шума.</TipItem>
                <TipItem>Добавьте пару слов о жанрах, которые вам особенно близки.</TipItem>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>
    </MainLayout>
  );
}

function FeatureCard({ icon, title, description }: Readonly<{ icon: React.ReactNode; title: string; description: string }>) {
  return (
    <Card className="border-border/70 shadow-sm">
      <CardContent className="space-y-4 p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          {icon}
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function TipItem({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <li className="flex gap-3">
      <Mic className="mt-1 h-4 w-4 shrink-0 text-amber-500" />
      <span>{children}</span>
    </li>
  );
}
