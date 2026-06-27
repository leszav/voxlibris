import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { apiRequest } from "@/lib/queryClient";

interface CommercePrice {
  id: string;
  amountRub: number;
  period: "one_time" | "month" | "year";
  isDefault: boolean;
}

interface CommerceFeature {
  label: string;
  featureKey: string;
  isHighlighted: boolean;
}

interface SubscriptionPlan {
  id: string;
  title: string;
  description: string | null;
  metadata: { isPopular?: boolean } | null;
  prices: CommercePrice[];
  features: CommerceFeature[];
}

const FAQS = [
  { question: "Можно ли сменить тариф в любой момент?", answer: "Да, тариф можно изменить или отменить в настройках профиля." },
  { question: "Карты хранятся в VoxLibris?", answer: "Нет. Токенизация и рекуррентные платежи выполняются на стороне платёжного провайдера." },
  { question: "Есть ли фискализация?", answer: "Да, чек формируется через подключенного агрегатора по 54-ФЗ." },
];

function defaultPrice(plan: SubscriptionPlan) {
  return plan.prices.find((price) => price.isDefault) ?? plan.prices[0];
}

function formatPrice(plan: SubscriptionPlan) {
  const price = defaultPrice(plan);
  if (!price || price.amountRub === 0) return "Бесплатно";
  return `${price.amountRub.toLocaleString("ru-RU")} ₽`;
}

export default function Pricing() {
  const { data: plans = [], isLoading, error } = useQuery<SubscriptionPlan[]>({ queryKey: ["/api/commerce/plans"] });

  async function checkout(plan: SubscriptionPlan) {
    const price = defaultPrice(plan);
    const result = await apiRequest<{ confirmationUrl: string }>("/api/commerce/checkout", {
      method: "POST",
      body: JSON.stringify({ productId: plan.id, priceId: price?.id }),
    });
    if (result.confirmationUrl) window.location.href = result.confirmationUrl;
  }

  return (
    <MainLayout>
      <div className="container py-20 px-6 md:px-12">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-primary">Выберите свой план</h1>
          <p className="text-xl text-muted-foreground">От бесплатного прослушивания до профессиональных инструментов чтеца.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-8 text-center text-destructive">Не удалось загрузить тарифы. Попробуйте обновить страницу.</div>
        ) : plans.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Публичные тарифы пока не опубликованы.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            {plans.map((plan) => {
              const price = defaultPrice(plan);
              const isPopular = Boolean(plan.metadata?.isPopular);

              return (
              <Card key={plan.id} className={`flex flex-col relative ${isPopular ? "border-amber-500 shadow-xl scale-105 z-10" : "border-border"}`}>
                {isPopular && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">Популярный выбор</div>}
                <CardHeader>
                  <CardTitle className="text-2xl font-serif">{plan.title}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="mb-6">
                    <span className="text-4xl font-bold">{formatPrice(plan)}</span>
                    {price && price.amountRub > 0 && price.period !== "one_time" && <span className="text-muted-foreground"> / {price.period === "month" ? "месяц" : "год"}</span>}
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature.featureKey} className="flex items-start gap-3 text-sm">
                        <Check className="w-5 h-5 text-green-500 shrink-0" />
                        <span>{feature.label}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button className={`w-full ${isPopular ? "bg-amber-600 hover:bg-amber-700" : ""}`} variant={isPopular ? "default" : "outline"} onClick={() => checkout(plan)} disabled={!price}>
                    {!price || price.amountRub === 0 ? "Начать бесплатно" : "Оформить подписку"}
                  </Button>
                </CardFooter>
              </Card>
              );
            })}
          </div>
        )}

        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-serif font-bold text-center mb-8">Частые вопросы</h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, index) => (
              <AccordionItem key={faq.question} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-lg font-medium">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </MainLayout>
  );
}
