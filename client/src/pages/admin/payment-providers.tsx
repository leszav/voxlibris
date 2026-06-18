import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, KeyRound, Loader2, Save } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

type ProviderCode = "yookassa";
type ProviderStatus = "active" | "inactive";

interface ProviderFormState {
  code: ProviderCode;
  name: string;
  status: ProviderStatus;
  priority: number;
  shopId: string;
  apiKey: string;
  returnUrl: string;
  receiptEnabled: "true" | "false";
  taxSystemCode: string;
  vatCode: string;
  paymentSubject: string;
  paymentMode: string;
}

const defaultForm: ProviderFormState = {
  code: "yookassa",
  name: "ЮKassa test",
  status: "active",
  priority: 10,
  shopId: "",
  apiKey: "",
  returnUrl: "https://voxlibris.ru/pricing",
  receiptEnabled: "false",
  taxSystemCode: "",
  vatCode: "1",
  paymentSubject: "service",
  paymentMode: "full_payment",
};

const PROVIDERS_QUERY_KEY = ["/api/commerce/admin/providers"] as const;

function buildCredentials(form: ProviderFormState) {
  const credentials: Record<string, string> = {
    returnUrl: form.returnUrl,
  };
  if (form.code === "yookassa") {
    credentials.shopId = form.shopId;
    credentials.apiKey = form.apiKey;
    credentials.receiptEnabled = form.receiptEnabled;
    credentials.vatCode = form.vatCode;
    credentials.paymentSubject = form.paymentSubject;
    credentials.paymentMode = form.paymentMode;
    if (form.taxSystemCode.trim()) credentials.taxSystemCode = form.taxSystemCode.trim();
  }
  return credentials;
}

function validateForm(form: ProviderFormState) {
  if (!form.name.trim()) return "Укажите название провайдера";
  if (!form.shopId.trim()) return "Укажите ID магазина ЮKassa";
  if (!form.apiKey.trim()) return "Укажите API-key ЮKassa";
  if (!form.returnUrl.trim()) return "Укажите returnUrl";
  return null;
}

export default function AdminPaymentProvidersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProviderFormState>(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const { data: providers = [] } = useQuery<Array<{ status: ProviderStatus }>>({ queryKey: PROVIDERS_QUERY_KEY });
  const isConfigured = providers.length > 0;

  const saveProvider = useMutation({
    mutationFn: async () => {
      const validationError = validateForm(form);
      if (validationError) throw new Error(validationError);
      return apiRequest("/api/commerce/admin/providers", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name.trim(),
          status: form.status,
          priority: form.priority,
          credentials: buildCredentials(form),
        }),
      });
    },
    onSuccess: async () => {
      setError(null);
      setForm((current) => ({ ...current, apiKey: "" }));
      await queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
    },
    onError: (mutationError) => setError(mutationError instanceof Error ? mutationError.message : "Не удалось сохранить провайдера"),
  });

  function updateForm<K extends keyof ProviderFormState>(key: K, value: ProviderFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <AdminLayout>
      <div className="container mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="h-7 w-7" />
            Настройки ЮKassa
          </h1>
          <p className="text-muted-foreground mt-2">ЮKassa — единственный рабочий платёжный провайдер текущего слоя монетизации.</p>
        </div>

        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Безопасность ключей</AlertTitle>
          <AlertDescription>
            Введите тестовый или рабочий API-ключ ЮKassa. После сохранения поле ключа очищается, а сервер хранит платёжные настройки только в зашифрованном виде.
          </AlertDescription>
        </Alert>

        <div className="max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Подключение магазина</CardTitle>
              <CardDescription>
                Для ЮKassa используйте ID магазина и API-ключ из тестового или рабочего кабинета.
                {isConfigured ? " Текущая конфигурация уже сохранена; при замене API-ключ нужно ввести заново." : " ЮKassa ещё не настроена."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Провайдер</Label>
                  <Input value="ЮKassa" disabled />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-name">Название</Label>
                  <Input id="provider-name" value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="provider-shop-id">ID магазина</Label>
                  <Input id="provider-shop-id" value={form.shopId} onChange={(event) => updateForm("shopId", event.target.value)} autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider-priority">Приоритет</Label>
                  <Input id="provider-priority" type="number" value={form.priority} onChange={(event) => updateForm("priority", Number(event.target.value))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-secret">API-key</Label>
                <Input id="provider-secret" type="password" value={form.apiKey} onChange={(event) => updateForm("apiKey", event.target.value)} autoComplete="new-password" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-return-url">Адрес возврата после оплаты</Label>
                <Input id="provider-return-url" value={form.returnUrl} onChange={(event) => updateForm("returnUrl", event.target.value)} />
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <div>
                  <Label>54-ФЗ чеки ЮKassa</Label>
                  <p className="text-xs text-muted-foreground">Включайте только если фискализация подключена в магазине ЮKassa. Email покупателя берётся из аккаунта пользователя.</p>
                </div>
                <Select value={form.receiptEnabled} onValueChange={(value) => updateForm("receiptEnabled", value as "true" | "false")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">Не передавать данные для чека</SelectItem>
                    <SelectItem value="true">Передавать данные для чека</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="provider-tax-system">СНО, tax_system_code</Label>
                    <Input id="provider-tax-system" value={form.taxSystemCode} onChange={(event) => updateForm("taxSystemCode", event.target.value)} placeholder="например 2" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-vat-code">НДС, vat_code</Label>
                    <Input id="provider-vat-code" value={form.vatCode} onChange={(event) => updateForm("vatCode", event.target.value)} placeholder="1 — НДС не облагается" />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="provider-payment-subject">Предмет расчёта</Label>
                    <Input id="provider-payment-subject" value={form.paymentSubject} onChange={(event) => updateForm("paymentSubject", event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-payment-mode">Способ расчёта</Label>
                    <Input id="provider-payment-mode" value={form.paymentMode} onChange={(event) => updateForm("paymentMode", event.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Статус после сохранения</Label>
                <Select value={form.status} onValueChange={(value) => updateForm("status", value as ProviderStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Активный</SelectItem>
                    <SelectItem value="inactive">Неактивный</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={() => saveProvider.mutate()} disabled={saveProvider.isPending} className="w-full gap-2">
                {saveProvider.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Сохранить настройки ЮKassa
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
