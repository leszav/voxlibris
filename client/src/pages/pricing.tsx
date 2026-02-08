import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { ComingSoonOverlay } from "@/components/ui/coming-soon-overlay";
import { Check, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const PLANS = [
  {
    name: "Слушатель",
    price: "Бесплатно",
    description: "Идеально для знакомства с платформой и участия в открытых клубах.",
    features: [
      "Доступ к открытым клубам",
      "Участие в чате эфира",
      "Личная библиотека",
      "Базовое качество аудио (128kbps)",
    ],
    missing: [
      "Записи эфиров",
      "Создание своего клуба",
      "Монетизация голоса",
      "HD аудио (320kbps)",
    ],
    buttonText: "Начать бесплатно",
    popular: false,
  },
  {
    name: "Энтузиаст",
    price: "299 ₽",
    period: "/ месяц",
    description: "Для тех, кто хочет больше комфорта и доступа к эксклюзивному контенту.",
    features: [
      "Все функции Слушателя",
      "Доступ к записям прошедших эфиров",
      "HD аудио (320kbps)",
      "Отключение рекламы",
      "Приоритетная поддержка",
    ],
    missing: [
      "Создание своего клуба",
      "Монетизация голоса",
    ],
    buttonText: "Выбрать Энтузиаст",
    popular: true,
  },
  {
    name: "Чтец PRO",
    price: "990 ₽",
    period: "/ месяц",
    description: "Полный набор инструментов для создания своих клубов и заработка.",
    features: [
      "Все функции Энтузиаста",
      "Создание платных и закрытых клубов",
      "Инструменты монетизации и чаевые",
      "Расширенная статистика студии",
      "Персональный профиль чтеца",
      "Приоритет в каталоге",
    ],
    missing: [],
    buttonText: "Стать PRO Чтецом",
    popular: false,
  },
];

const FAQS = [
  {
    question: "Можно ли сменить тариф в любой момент?",
    answer: "Да, вы можете изменить или отменить подписку в любое время в настройках профиля. Изменения вступят в силу со следующего расчетного периода."
  },
  {
    question: "Как работает монетизация для чтецов?",
    answer: "Чтецы PRO могут создавать платные клубы с доступом по билетам или подписке. Платформа берет комиссию 15%, остальное получаете вы."
  },
  {
    question: "Нужно ли профессиональное оборудование?",
    answer: "Для старта достаточно хорошего USB-микрофона. Наша студия имеет встроенные фильтры шумоподавления, но качество исходного звука важно для рейтинга."
  },
  {
    question: "Есть ли пробный период?",
    answer: "Да, для тарифа «Энтузиаст» доступен 7-дневный пробный период."
  }
];

export default function Pricing() {
  return (
    <MainLayout>
      <ComingSoonOverlay>
      <div className="container py-20 px-6 md:px-12">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-primary">Выберите свой план</h1>
          <p className="text-xl text-muted-foreground">
            От бесплатного прослушивания до профессиональной карьеры чтеца — у нас есть тариф для каждого.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {PLANS.map((plan) => (
            <Card key={plan.name} className={`flex flex-col relative ${plan.popular ? 'border-amber-500 shadow-xl scale-105 z-10' : 'border-border'}`}>
              {plan.popular && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  Популярный выбор
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl font-serif">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
                </div>
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm">
                      <Check className="w-5 h-5 text-green-500 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                  {plan.missing.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-muted-foreground/60">
                      <X className="w-5 h-5 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button 
                  className={`w-full ${plan.popular ? 'bg-amber-600 hover:bg-amber-700' : ''}`} 
                  variant={plan.popular ? 'default' : 'outline'}
                >
                  {plan.buttonText}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="max-w-3xl mx-auto">
           <h2 className="text-3xl font-serif font-bold text-center mb-8">Частые вопросы</h2>
           <Accordion type="single" collapsible className="w-full">
             {FAQS.map((faq, index) => (
               <AccordionItem key={index} value={`item-${index}`}>
                 <AccordionTrigger className="text-left text-lg font-medium">
                   {faq.question}
                 </AccordionTrigger>
                 <AccordionContent className="text-muted-foreground">
                   {faq.answer}
                 </AccordionContent>
               </AccordionItem>
             ))}
           </Accordion>
        </div>
      </div>
      </ComingSoonOverlay>
    </MainLayout>
  );
}
