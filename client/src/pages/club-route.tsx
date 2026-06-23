import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import ClubDetails from "@/pages/club-details";
import ReaderClubDetails from "@/pages/reader-club-details";
import { MainLayout } from "@/components/layout/MainLayout";
import { useClub } from "@/hooks/use-clubs";
import { useAuth } from "@/hooks/use-auth";
import { ApiError, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CommercePrice {
  id: string;
  amountRub: number;
  period: "one_time" | "week" | "month" | "quarter" | "year";
  isDefault: boolean;
}

interface ReaderClubProduct {
  id: string;
  title: string;
  description: string | null;
  prices: CommercePrice[];
}

const periodLabels: Record<CommercePrice["period"], string> = {
  one_time: "разово",
  week: "неделя",
  month: "месяц",
  quarter: "квартал",
  year: "год",
};

function defaultPrice(product: ReaderClubProduct) {
  return product.prices.find((price) => price.isDefault) ?? product.prices[0];
}

function ReaderClubPaywall({ clubId }: { clubId: string }) {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutProductId, setCheckoutProductId] = useState<string | null>(null);
  const { data: products = [], isLoading } = useQuery<ReaderClubProduct[]>({
    queryKey: ["reader-club-products", clubId],
    queryFn: () => apiRequest<ReaderClubProduct[]>(`/api/commerce/products?type=reader_club_subscription&scopeType=reader_club&scopeId=${encodeURIComponent(clubId)}`),
  });

  async function checkout(product: ReaderClubProduct) {
    const price = defaultPrice(product);
    if (!price) return;
    if (!isAuthenticated) {
      setLocation(`/auth/login?next=${encodeURIComponent(`/clubs/${clubId}`)}`);
      return;
    }

    setCheckoutError(null);
    setCheckoutProductId(product.id);
    try {
      const result = await apiRequest<{ confirmationUrl: string }>("/api/commerce/checkout", {
        method: "POST",
        body: JSON.stringify({ productId: product.id, priceId: price.id }),
      });
      if (result.confirmationUrl) window.location.href = result.confirmationUrl;
      else window.location.reload();
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Не удалось начать оплату");
    } finally {
      setCheckoutProductId(null);
    }
  }

  return (
    <MainLayout>
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <Alert className="mb-6">
          <AlertTitle>Нужна активная подписка</AlertTitle>
          <AlertDescription>После оплаты доступ к странице клуба и live-эфирам откроется автоматически.</AlertDescription>
        </Alert>
        {checkoutError && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Оплата не запустилась</AlertTitle>
            <AlertDescription>{checkoutError}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : products.length === 0 ? (
          <Card><CardContent className="py-6 text-sm text-muted-foreground">Для этого клуба пока не опубликован тариф.</CardContent></Card>
        ) : products.map((product) => {
          const price = defaultPrice(product);
          return (
            <Card key={product.id}>
              <CardHeader>
                <CardTitle>{product.title}</CardTitle>
                {product.description && <CardDescription>{product.description}</CardDescription>}
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{price ? `${price.amountRub.toLocaleString("ru-RU")} ₽` : "Цена не задана"}</div>
                {price && <div className="text-sm text-muted-foreground">за {periodLabels[price.period]}</div>}
              </CardContent>
              <CardFooter>
                <Button className="w-full" disabled={!price || checkoutProductId === product.id} onClick={() => checkout(product)}>
                  {checkoutProductId === product.id ? "Открываем оплату..." : isAuthenticated ? "Оплатить доступ" : "Войти и оплатить доступ"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </MainLayout>
  );
}

function PrivateClubNotice() {
  return (
    <MainLayout>
      <div className="container mx-auto flex max-w-md justify-center px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle>Закрытый клуб</CardTitle>
            <CardDescription>Для доступа необходимо приглашение от участника клуба.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" asChild>
              <Link href="/clubs">Вернуться к списку клубов</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </MainLayout>
  );
}

function ClubRouteError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Не удалось загрузить клуб";

  return (
    <MainLayout>
      <div className="container mx-auto max-w-md px-4 py-12">
        <Alert variant="destructive">
          <AlertTitle>Ошибка загрузки клуба</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    </MainLayout>
  );
}

function ClubRouteLoading() {
  return (
    <MainLayout>
      <div className="container flex items-center justify-center px-4 py-12 text-sm text-muted-foreground sm:px-6 md:px-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Загружаем клуб...
      </div>
    </MainLayout>
  );
}

export default function ClubRoute() {
  const params = useParams<{ id?: string }>();
  const clubId = params.id || "";
  const { isLoading: authLoading } = useAuth();
  const { data: club, isLoading, error } = useClub(clubId, !!clubId && !authLoading);

  if (authLoading || isLoading) {
    return <ClubRouteLoading />;
  }

  if (error instanceof ApiError && error.code === "READER_CLUB_ACCESS_REQUIRED") {
    return <ReaderClubPaywall clubId={clubId} />;
  }

  if (error instanceof ApiError && error.code === "PRIVATE_CLUB_ACCESS_DENIED") {
    return <PrivateClubNotice />;
  }

  if (error) {
    return <ClubRouteError error={error} />;
  }

  if (club?.type === "reader-led") {
    return <ReaderClubDetails clubId={clubId} initialClub={club} />;
  }

  return <ClubDetails />;
}
