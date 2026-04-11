import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ComingSoonOverlay } from "@/components/ui/coming-soon-overlay";
import { Mic, Users, DollarSign, ArrowRight, Play } from "lucide-react";
import studioBg from "@assets/generated_images/professional_home_recording_studio_setup.png";
import { Link } from "wouter";

export default function BecomeReader() {
  return (
    <MainLayout>
      <ComingSoonOverlay>
      {/* Hero */}
      <div className="relative h-[500px] w-full overflow-hidden">
        <div className="absolute inset-0">
           <img src={studioBg} alt="Studio Microphone" className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-stone-900/70" />
        
        <div className="container relative h-full flex flex-col justify-center px-6 md:px-12">
          <div className="max-w-2xl space-y-6">
             <h1 className="text-4xl md:text-6xl font-serif font-bold text-white leading-tight">
               Ваш голос может<br />
               <span className="text-amber-500">оживить историю</span>
             </h1>
             <p className="text-xl text-stone-200 leading-relaxed">
               Станьте чтецом VoxLibris, создавайте свои клубы и монетизируйте талант, делая то, что любите — читая книги.
             </p>
             <div className="flex gap-4 pt-4">
               <Button size="lg" className="bg-amber-600 hover:bg-amber-700 text-white border-none h-12 px-8">
                 Подать заявку
               </Button>
               <Link href="/clubs">
                 <Button size="lg" variant="outline" className="text-white border-white/20 hover:bg-white/10 h-12">
                   <Play className="w-4 h-4 mr-2" /> Мои клубы
                 </Button>
               </Link>
             </div>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="container py-20 px-6 md:px-12">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-serif font-bold mb-4">Почему стоит стать чтецом?</h2>
          <p className="text-muted-foreground text-lg">
            Мы предоставляем платформу, аудиторию и инструменты. Вы приносите талант.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <BenefitCard 
            icon={<Users className="w-8 h-8 text-amber-500" />}
            title="Своя аудитория"
            description="Собирайте вокруг себя сообщество любителей литературы. Общайтесь с слушателями напрямую во время эфиров."
          />
          <BenefitCard 
            icon={<DollarSign className="w-8 h-8 text-green-500" />}
            title="Монетизация"
            description="Получайте доход от платных подписок на ваш клуб, продаж билетов на специальные чтения и чаевых от фанатов."
          />
          <BenefitCard 
            icon={<Mic className="w-8 h-8 text-blue-500" />}
            title="Профессиональный рост"
            description="Улучшайте навыки дикции и актерского мастерства. Получайте обратную связь и растите в рейтинге."
          />
        </div>

        {/* Application Form */}
        <div className="max-w-4xl mx-auto bg-card border rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row">
           <div className="p-8 md:p-12 flex-1 space-y-8">
              <div>
                 <h3 className="text-2xl font-serif font-bold mb-2">Заявка на статус Чтеца</h3>
                 <p className="text-muted-foreground">Заполните форму, и мы свяжемся с вами для прослушивания.</p>
              </div>
              
              <form className="space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <Label htmlFor="firstName">Имя</Label>
                       <Input id="firstName" placeholder="Иван" />
                    </div>
                    <div className="space-y-2">
                       <Label htmlFor="lastName">Фамилия</Label>
                       <Input id="lastName" placeholder="Иванов" />
                    </div>
                 </div>
                 
                 <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="ivan@example.com" />
                 </div>

                 <div className="space-y-2">
                    <Label htmlFor="experience">Опыт озвучки (если есть)</Label>
                    <Textarea id="experience" placeholder="Расскажите о своем опыте..." />
                 </div>
                 
                 <div className="space-y-2">
                    <Label htmlFor="demo">Ссылка на демо (Google Drive / SoundCloud)</Label>
                    <Input id="demo" placeholder="https://..." />
                 </div>
                 
                 <Button className="w-full bg-primary text-primary-foreground h-11">
                    Отправить заявку <ArrowRight className="ml-2 w-4 h-4" />
                 </Button>
              </form>
           </div>
           
           <div className="bg-secondary/30 p-8 md:p-12 w-full md:w-80 flex flex-col justify-center space-y-6">
              <div className="space-y-2">
                 <h4 className="font-bold text-lg">Советы для демо</h4>
                 <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Выберите отрывок 1-2 минуты</li>
                    <li className="flex gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Читайте в тишине без эха</li>
                    <li className="flex gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Покажите эмоции персонажей</li>
                    <li className="flex gap-2"><Check className="w-4 h-4 text-green-500 shrink-0" /> Не используйте музыку</li>
                 </ul>
              </div>
           </div>
        </div>
      </div>
      </ComingSoonOverlay>
    </MainLayout>
  );
}

function BenefitCard({ icon, title, description }: Readonly<{ icon: React.ReactNode, title: string, description: string }>) {
  return (
    <Card className="border-none shadow-none bg-secondary/20">
      <CardContent className="pt-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-background flex items-center justify-center mx-auto shadow-sm">
          {icon}
        </div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function Check({ className }: Readonly<{ className?: string }>) {
   return (
      <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
   )
}
