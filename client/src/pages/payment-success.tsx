import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export default function PaymentSuccessPage() {
  const [, setLocation] = useLocation();
  const [secondsLeft, setSecondsLeft] = useState(4);
  const clubId = useMemo(() => new URLSearchParams(window.location.search).get("clubId"), []);
  const targetPath = clubId ? `/clubs/${clubId}` : "/library";

  useEffect(() => {
    const redirectTimer = window.setTimeout(() => setLocation(targetPath), 4000);
    const countdownTimer = window.setInterval(() => {
      setSecondsLeft((value) => Math.max(0, value - 1));
    }, 1000);

    return () => {
      window.clearTimeout(redirectTimer);
      window.clearInterval(countdownTimer);
    };
  }, [setLocation, targetPath]);

  return (
    <MainLayout>
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <CardTitle>Подписка успешно оформлена</CardTitle>
            <CardDescription>
              {clubId
                ? "Доступ к клубу открыт. Сейчас перенаправим вас на страницу клуба."
                : "Оплата прошла успешно. Сейчас перенаправим вас дальше."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Переход через {secondsLeft} сек.
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full">
              <Link href={targetPath}>{clubId ? "Перейти в клуб" : "Продолжить"}</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </MainLayout>
  );
}
