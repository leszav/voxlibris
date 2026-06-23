import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type TariffStatus = "draft" | "active" | "archived";
type TariffVisibility = "public" | "private";
type TariffPeriod = "week" | "month" | "quarter" | "year";

interface TariffTemplate {
  id: string;
  title: string;
  description: string | null;
  amountRub: number;
  period: TariffPeriod;
  readerShareBps: number;
  acquiringFeeBps: number;
  status: TariffStatus;
  visibility: TariffVisibility;
  sortOrder: number;
}

interface TariffRequest {
  id: string;
  clubId: string;
  title: string;
  description: string | null;
  requestedAmountRub: number;
  requestedPeriod: TariffPeriod;
  message: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
}

interface TariffForm {
  id?: string;
  title: string;
  description: string;
  amountRub: string;
  period: TariffPeriod;
  readerSharePercent: string;
  acquiringFeePercent: string;
  status: TariffStatus;
  visibility: TariffVisibility;
  sortOrder: string;
}

const QUERY_KEY = ["/api/commerce/admin/reader-club-tariff-templates"] as const;
const REQUESTS_QUERY_KEY = ["/api/commerce/admin/reader-club-tariff-requests"] as const;

const emptyForm: TariffForm = {
  title: "",
  description: "",
  amountRub: "990",
  period: "month",
  readerSharePercent: "70",
  acquiringFeePercent: "3.5",
  status: "active",
  visibility: "public",
  sortOrder: "0",
};

function percentToBps(value: string) {
  return Math.round(Number(value.replace(",", ".")) * 100);
}

function bpsToPercent(value: number) {
  return (value / 100).toString();
}

function payloadFromForm(form: TariffForm) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    amountRub: Number(form.amountRub),
    period: form.period,
    readerShareBps: percentToBps(form.readerSharePercent),
    acquiringFeeBps: percentToBps(form.acquiringFeePercent),
    status: form.status,
    visibility: form.visibility,
    sortOrder: Number(form.sortOrder),
  };
}

function formFromTemplate(template: TariffTemplate): TariffForm {
  return {
    id: template.id,
    title: template.title,
    description: template.description ?? "",
    amountRub: String(template.amountRub),
    period: template.period,
    readerSharePercent: bpsToPercent(template.readerShareBps),
    acquiringFeePercent: bpsToPercent(template.acquiringFeeBps),
    status: template.status,
    visibility: template.visibility,
    sortOrder: String(template.sortOrder),
  };
}

export default function AdminReaderClubTariffsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<TariffForm>(emptyForm);
  const [review, setReview] = useState({ readerSharePercent: "70", acquiringFeePercent: "3.5", reviewComment: "" });
  const { data: templates = [], isLoading } = useQuery<TariffTemplate[]>({ queryKey: QUERY_KEY });
  const { data: requests = [] } = useQuery<TariffRequest[]>({ queryKey: REQUESTS_QUERY_KEY });
  const visibleTemplatesCount = templates.filter((template) => template.status === "active" && template.visibility === "public").length;

  const saveTemplate = useMutation({
    mutationFn: () => apiRequest(form.id ? `/api/commerce/admin/reader-club-tariff-templates/${form.id}` : "/api/commerce/admin/reader-club-tariff-templates", {
      method: form.id ? "PATCH" : "POST",
      body: JSON.stringify(payloadFromForm(form)),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Тариф сохранён" });
      setForm(emptyForm);
    },
    onError: (error) => toast({ title: "Ошибка сохранения", description: error instanceof Error ? error.message : "Проверьте поля", variant: "destructive" }),
  });

  const reviewRequest = useMutation({
    mutationFn: ({ requestId, action }: { requestId: string; action: "approve" | "reject" }) => apiRequest(`/api/commerce/admin/reader-club-tariff-requests/${requestId}/review`, {
      method: "POST",
      body: JSON.stringify({
        action,
        readerShareBps: percentToBps(review.readerSharePercent),
        acquiringFeeBps: percentToBps(review.acquiringFeePercent),
        reviewComment: review.reviewComment.trim() || null,
      }),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: REQUESTS_QUERY_KEY });
      toast({ title: "Заявка обработана" });
    },
    onError: (error) => toast({ title: "Ошибка обработки", description: error instanceof Error ? error.message : "Не удалось обработать заявку", variant: "destructive" }),
  });

  useEffect(() => {
    if (!form.id) return;
    const current = templates.find((template) => template.id === form.id);
    if (current) setForm(formFromTemplate(current));
  }, [templates, form.id]);

  return (
    <AdminLayout>
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Тарифы клубов чтецов</h1>
          <p className="text-muted-foreground">Шаблоны, которые владельцы клубов смогут выбирать для платного доступа.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <Card>
            <CardHeader>
              <CardTitle>Шаблоны</CardTitle>
              <CardDescription>
                Владельцам клубов доступны только шаблоны со статусом «Активен» и видимостью «Public». Сейчас доступно: {visibleTemplatesCount}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : templates.map((template) => {
                const unavailable = template.status !== "active" || template.visibility !== "public";
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setForm(formFromTemplate(template))}
                    className={`w-full rounded-lg border p-4 text-left hover:bg-muted/50 ${unavailable ? "border-red-300 bg-red-50" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{template.title}</div>
                      <div className="text-sm text-muted-foreground">{template.amountRub.toLocaleString("ru-RU")} ₽ / {template.period}</div>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">Чтец {bpsToPercent(template.readerShareBps)}%, эквайринг {bpsToPercent(template.acquiringFeeBps)}%, {template.status}, {template.visibility}</div>
                    {unavailable ? (
                      <div className="mt-2 rounded-md border border-red-200 bg-red-100 px-3 py-2 text-sm text-red-800">
                        Этот тариф невозможно выбрать в клубе. Сделайте его активным и публичным.
                      </div>
                    ) : null}
                  </button>
                );
              })}
              {!isLoading && templates.length === 0 && <div className="text-sm text-muted-foreground">Шаблонов пока нет.</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{form.id ? "Редактировать шаблон" : "Новый шаблон"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Название</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-2"><Label>Описание</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Цена, ₽</Label><Input type="number" min="1" value={form.amountRub} onChange={(e) => setForm({ ...form, amountRub: e.target.value })} /></div>
                <div className="space-y-2"><Label>Период</Label><Select value={form.period} onValueChange={(period) => setForm({ ...form, period: period as TariffPeriod })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="week">Неделя</SelectItem><SelectItem value="month">Месяц</SelectItem><SelectItem value="quarter">Квартал</SelectItem><SelectItem value="year">Год</SelectItem></SelectContent></Select></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Доля чтеца, %</Label><Input value={form.readerSharePercent} onChange={(e) => setForm({ ...form, readerSharePercent: e.target.value })} /></div>
                <div className="space-y-2"><Label>Эквайринг, %</Label><Input value={form.acquiringFeePercent} onChange={(e) => setForm({ ...form, acquiringFeePercent: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Статус</Label><Select value={form.status} onValueChange={(status) => setForm({ ...form, status: status as TariffStatus })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Черновик</SelectItem><SelectItem value="active">Активен</SelectItem><SelectItem value="archived">Архив</SelectItem></SelectContent></Select></div>
                <div className="space-y-2"><Label>Видимость</Label><Select value={form.visibility} onValueChange={(visibility) => setForm({ ...form, visibility: visibility as TariffVisibility })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Private</SelectItem><SelectItem value="public">Public</SelectItem></SelectContent></Select></div>
              </div>
              <div className="space-y-2"><Label>Сортировка</Label><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div>
              <div className="flex gap-2">
                <Button onClick={() => saveTemplate.mutate()} disabled={saveTemplate.isPending || !form.title.trim()} className="gap-2"><Save className="h-4 w-4" />Сохранить</Button>
                {form.id && <Button variant="outline" onClick={() => setForm(emptyForm)}>Новый</Button>}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Индивидуальные заявки</CardTitle>
            <CardDescription>Approve создаёт продукт, цену и активный тариф клуба.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2"><Label>Доля чтеца, %</Label><Input value={review.readerSharePercent} onChange={(e) => setReview({ ...review, readerSharePercent: e.target.value })} /></div>
              <div className="space-y-2"><Label>Эквайринг, %</Label><Input value={review.acquiringFeePercent} onChange={(e) => setReview({ ...review, acquiringFeePercent: e.target.value })} /></div>
              <div className="space-y-2"><Label>Комментарий</Label><Input value={review.reviewComment} onChange={(e) => setReview({ ...review, reviewComment: e.target.value })} /></div>
            </div>
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{request.title}</div>
                    <div className="text-sm text-muted-foreground">
                      Клуб {request.clubId}, {request.requestedAmountRub.toLocaleString("ru-RU")} ₽ / {request.requestedPeriod}, статус {request.status}
                    </div>
                    {request.message ? <div className="mt-1 text-sm">{request.message}</div> : null}
                  </div>
                  {request.status === "pending" ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => reviewRequest.mutate({ requestId: request.id, action: "approve" })} disabled={reviewRequest.isPending}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => reviewRequest.mutate({ requestId: request.id, action: "reject" })} disabled={reviewRequest.isPending}>Reject</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {requests.length === 0 ? <div className="text-sm text-muted-foreground">Заявок пока нет.</div> : null}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
