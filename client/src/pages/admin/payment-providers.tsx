import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, KeyRound, Loader2, Save, Edit2 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ProviderCode = "yookassa";
type ProviderStatus = "active" | "inactive";

interface ProviderListItem {
  name: string;
  status: ProviderStatus;
  priority: number;
  credentials?: Partial<Record<"shopId" | "receiptEnabled" | "taxSystemCode" | "vatCode" | "paymentSubject" | "paymentMode", string>>;
}

interface ProviderFormState {
  code: ProviderCode;
  name: string;
  status: ProviderStatus;
  priority: number;
  shopId: string;
  apiKey: string;
  receiptEnabled: "true" | "false";
  taxSystemCode: string;
  vatCode: string;
  paymentSubject: string;
  paymentMode: string;
}

const defaultForm: ProviderFormState = {
  code: "yookassa",
  name: "ЮKassa",
  status: "active",
  priority: 10,
  shopId: "",
  apiKey: "",
  receiptEnabled: "false",
  taxSystemCode: "",
  vatCode: "1",
  paymentSubject: "service",
  paymentMode: "full_payment",
};

const PROVIDERS_QUERY_KEY = ["/api/commerce/admin/providers"] as const;

function buildCredentials(form: ProviderFormState, isApiKeyProvided: boolean) {
  const credentials: Record<string, string> = {};
  if (form.code === "yookassa") {
    credentials.shopId = form.shopId;
    // Отправляем API-key только если он был введён в форму
    if (isApiKeyProvided) {
      credentials.apiKey = form.apiKey;
    }
    credentials.receiptEnabled = form.receiptEnabled;
    credentials.vatCode = form.vatCode;
    credentials.paymentSubject = form.paymentSubject;
    credentials.paymentMode = form.paymentMode;
    if (form.taxSystemCode.trim()) credentials.taxSystemCode = form.taxSystemCode.trim();
  }
  return credentials;
}

function validateForm(form: ProviderFormState, isConfigured: boolean, apiKeyEditing: boolean) {
  if (!form.name.trim()) return "Укажите название провайдера";
  if (!form.shopId.trim()) return "Укажите ID магазина ЮKassa";
  // API-key обязателен только при первом сохранении или при явном редактировании
  if ((!isConfigured || apiKeyEditing) && !form.apiKey.trim()) return "Укажите API-key ЮKassa";
  return null;
}

export default function AdminPaymentProvidersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<ProviderFormState>(defaultForm);
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const { data: providers = [] } = useQuery<ProviderListItem[]>({ queryKey: PROVIDERS_QUERY_KEY });
  const isConfigured = providers.length > 0;

  useEffect(() => {
    const [provider] = providers;
    if (!provider || apiKeyEditing) return;

    setForm((current) => ({
      ...current,
      name: provider.name,
      status: provider.status,
      priority: provider.priority,
      shopId: provider.credentials?.shopId ?? "",
      receiptEnabled: provider.credentials?.receiptEnabled === "true" ? "true" : "false",
      taxSystemCode: provider.credentials?.taxSystemCode ?? "",
      vatCode: provider.credentials?.vatCode ?? "1",
      paymentSubject: provider.credentials?.paymentSubject ?? "service",
      paymentMode: provider.credentials?.paymentMode ?? "full_payment",
      apiKey: "",
    }));
  }, [apiKeyEditing, providers]);

  const saveProvider = useMutation({
    mutationFn: async () => {
      const validationError = validateForm(form, isConfigured, apiKeyEditing);
      if (validationError) throw new Error(validationError);
      
      // Определяем, был ли введён новый API-key
      const isApiKeyProvided = apiKeyEditing && form.apiKey.trim().length > 0;
      
      return apiRequest("/api/commerce/admin/providers", {
        method: "POST",
        body: JSON.stringify({
          code: form.code,
          name: form.name.trim(),
          status: form.status,
          priority: form.priority,
          credentials: buildCredentials(form, isApiKeyProvided),
        }),
      });
    },
    onSuccess: async () => {
      toast({
        title: "Настройки сохранены",
        description: "Конфигурация ЮKassa успешно обновлена.",
      });
      // Блокируем поле API-key и очищаем его значение в памяти
      setForm((current) => ({ ...current, apiKey: "" }));
      setApiKeyEditing(false);
      await queryClient.invalidateQueries({ queryKey: PROVIDERS_QUERY_KEY });
    },
    onError: (mutationError) => {
      const errorMessage = mutationError instanceof Error ? mutationError.message : "Не удалось сохранить провайдера";
      toast({
        variant: "destructive",
        title: "Ошибка сохранения",
        description: errorMessage,
      });
    },
  });

  function updateForm<K extends keyof ProviderFormState>(key: K, value: ProviderFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleEditApiKey() {
    setApiKeyEditing(true);
    setForm((current) => ({ ...current, apiKey: "" }));
  }

  const apiKeyFieldDisabled = isConfigured && !apiKeyEditing;
  const apiKeyPlaceholder = apiKeyFieldDisabled ? "••••••••• (ключ сохранён)" : "Введите API-ключ ЮKassa";

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
            API-ключ ЮKassa шифруется перед сохранением в базе данных. После успешного сохранения поле блокируется.
            Для изменения ключа используйте кнопку «Изменить API-ключ».
          </AlertDescription>
        </Alert>

        <div className="max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>Подключение магазина</CardTitle>
              <CardDescription>
                Для ЮKassa используйте ID магазина и API-ключ из тестового или рабочего кабинета.
                {isConfigured ? " Текущая конфигурация сохранена." : " ЮKassa ещё не настроена."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <Label htmlFor="provider-secret">API-ключ</Label>
                <div className="flex gap-2">
                  <Input
                    id="provider-secret"
                    type="password"
                    value={form.apiKey}
                    onChange={(event) => updateForm("apiKey", event.target.value)}
                    disabled={apiKeyFieldDisabled}
                    placeholder={apiKeyPlaceholder}
                    autoComplete="new-password"
                    className="flex-1"
                  />
                  {apiKeyFieldDisabled && (
                    <Button type="button" variant="outline" onClick={handleEditApiKey} className="gap-2">
                      <Edit2 className="h-4 w-4" />
                      Изменить
                    </Button>
                  )}
                </div>
                {apiKeyEditing && (
                  <p className="text-xs text-amber-600">
                    Внимание: после сохранения новый API-ключ заменит текущий.
                  </p>
                )}
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
