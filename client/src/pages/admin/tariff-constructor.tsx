import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Eye, Loader2, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getCommerceFeatureSupport } from "@shared/commerce-feature-support";

type Status = "draft" | "active" | "archived";
type Visibility = "public" | "private";
type Period = "one_time" | "week" | "month" | "quarter" | "year";
type ProductType = "platform_subscription" | "club_subscription" | "reader_club_subscription" | "ticket" | "recording_access" | "donation";
type ScopeType = "platform" | "club" | "reader_club" | "session" | "recording" | "reader";
type ValueType = "boolean" | "integer" | "string" | "json";
type ResetPeriod = "day" | "week" | "month" | "year";

interface FeatureRegistryItem { key: string; title: string; description: string | null; valueType: ValueType; category: string; defaultBool: boolean | null; defaultInt: number | null; defaultText: string | null; defaultJson?: unknown; isPublic: boolean; isActive: boolean; }
interface Product { id: string; type: ProductType; scopeType: ScopeType; scopeId: string | null; code: string; title: string; description: string | null; status: Status; visibility: Visibility; sortOrder: number; metadata?: { isPopular?: boolean } | null; }
interface Price { id: string; amountRub: number; period: Period; status: "active" | "archived"; isDefault: boolean; }
interface ProductFeature { id: string; label: string; featureKey: string; valueType: ValueType; valueBool: boolean | null; valueInt: number | null; valueText: string | null; valueJson?: unknown; resetPeriod: ResetPeriod | null; sortOrder: number; isHighlighted: boolean; isActive: boolean; }
interface ProductDetails extends Product { prices: Price[]; features: ProductFeature[]; }
interface OrderAudit { id: string; status: string; amountRub: number; amountUnit?: string; userId: string; productId: string; createdAt: string; }
interface PaymentAudit { id: string; status: string; amountRub: number; amountUnit?: string; providerPaymentId: string | null; fiscalReceiptId?: string | null; createdAt: string; }
interface PaymentEventAudit { id: string; status: string; eventType: string; providerPaymentId: string | null; receivedAt: string; }
interface EntitlementAudit { id: string; status: string; featureKey: string; sourceType: string; sourceId: string | null; userId: string; }
interface LedgerAudit { id: string; status: string; entryType: string; amountKopecks: number; paymentId: string; orderId: string; }

const productDefaults = { type: "platform_subscription" as ProductType, scopeType: "platform" as ScopeType, scopeId: "", code: "", title: "", description: "", status: "draft" as Status, visibility: "private" as Visibility, sortOrder: "0", isPopular: false };
const priceDefaults = { amountRub: "990", period: "month" as Period, status: "active" as const, isDefault: true };
const featureDefaults = { label: "", featureKey: "", valueType: "boolean" as ValueType, valueBool: true, valueInt: "", valueText: "", valueJson: "", resetPeriod: "none", sortOrder: "0", isHighlighted: false, isActive: true };
const registryDefaults = { key: "", title: "", description: "", category: "general", valueType: "boolean" as ValueType, defaultBool: false, defaultInt: "", defaultText: "", defaultJson: "", isPublic: true, isActive: true };

const productTypeLabels: Record<ProductType, string> = { platform_subscription: "Подписка платформы", club_subscription: "Подписка клуба", reader_club_subscription: "Клуб чтеца", ticket: "Билет", recording_access: "Доступ к записи", donation: "Донат" };
const scopeTypeLabels: Record<ScopeType, string> = { platform: "Вся платформа", club: "Обычный клуб", reader_club: "Клуб чтеца", session: "Сессия", recording: "Запись", reader: "Чтец" };
const statusLabels: Record<Status, string> = { draft: "Черновик", active: "Активен", archived: "В архиве" };
const periodLabels: Record<Period, string> = { one_time: "Разово", week: "Неделя", month: "Месяц", quarter: "Квартал", year: "Год" };
const valueTypeLabels: Record<ValueType, string> = { boolean: "Да/нет", integer: "Число", string: "Текст", json: "JSON" };
const resetPeriodLabels: Record<ResetPeriod | "none", string> = { none: "Без сброса", day: "День", week: "Неделя", month: "Месяц", year: "Год" };
const auditStatusLabels: Record<string, string> = { pending: "Ожидает", paid: "Оплачен", cancelled: "Отменён", expired: "Истёк", failed: "Ошибка", succeeded: "Успешен", refunded: "Возвращён", received: "Получено", processed: "Обработано", active: "Активно", revoked: "Отозвано", available: "Доступно", void: "Аннулировано" };
const ledgerTypeLabels: Record<string, string> = { acquiring_fee: "Комиссия эквайринга", reader_earning: "Начисление чтецу", platform_fee: "Комиссия платформы" };
const sourceTypeLabels: Record<string, string> = { payment: "Платёж", subscription: "Подписка", promo: "Промо", admin_grant: "Ручная выдача", migration: "Миграция" };
const eventTypeLabels: Record<string, string> = { "payment.succeeded": "Платёж успешен", "payment.canceled": "Платёж отменён", "payment.waiting_for_capture": "Ожидает подтверждения" };
const categoryLabels: Record<string, string> = { general: "Общие", platform: "Платформа", club: "Клуб", reader_club: "Клуб чтеца", studio: "Студия", billing: "Биллинг" };
const supportStatusLabels = { implemented: "Работает в коде", entitlement_only: "Только entitlement, требуется разработка" };

function labelOf<T extends string>(labels: Record<T, string>, value: T | string) {
  return labels[value as T] ?? value;
}

function jsonOrNull(value: string) {
  if (!value.trim()) return null;
  return JSON.parse(value) as unknown;
}

function featureValuePayload(form: typeof featureDefaults | typeof registryDefaults) {
  if (form.valueType === "boolean") return { defaultBool: "defaultBool" in form ? form.defaultBool : undefined, valueBool: "valueBool" in form ? form.valueBool : undefined };
  if (form.valueType === "integer") return { defaultInt: "defaultInt" in form ? Number(form.defaultInt || 0) : undefined, valueInt: "valueInt" in form ? Number(form.valueInt || 0) : undefined };
  if (form.valueType === "string") return { defaultText: "defaultText" in form ? form.defaultText || null : undefined, valueText: "valueText" in form ? form.valueText || null : undefined };
  return { defaultJson: "defaultJson" in form ? jsonOrNull(form.defaultJson) : undefined, valueJson: "valueJson" in form ? jsonOrNull(form.valueJson) : undefined };
}

function productFeaturePayload(form: typeof featureDefaults) {
  const value = featureValuePayload(form);
  return {
    label: form.label,
    featureKey: form.featureKey,
    valueType: form.valueType,
    valueBool: value.valueBool ?? null,
    valueInt: value.valueInt ?? null,
    valueText: value.valueText ?? null,
    valueJson: value.valueJson ?? null,
    resetPeriod: form.resetPeriod === "none" ? null : form.resetPeriod,
    sortOrder: Number(form.sortOrder || 0),
    isHighlighted: form.isHighlighted,
    isActive: form.isActive,
  };
}

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function EmptyState({ text }: Readonly<{ text: string }>) {
  return <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{text}</div>;
}

function ErrorState({ error }: Readonly<{ error: unknown }>) {
  return <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error instanceof Error ? error.message : "Ошибка загрузки"}</div>;
}

export default function AdminTariffConstructorPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedProductId, setSelectedProductId] = useState<string>();
  const [productForm, setProductForm] = useState(productDefaults);
  const [priceForm, setPriceForm] = useState(priceDefaults);
  const [featureForm, setFeatureForm] = useState(featureDefaults);
  const [registryForm, setRegistryForm] = useState(registryDefaults);
  const [pricingOnly, setPricingOnly] = useState(false);

  const products = useQuery({ queryKey: ["/api/commerce/admin/products"], queryFn: () => apiRequest<Product[]>("/api/commerce/admin/products") });
  const features = useQuery({ queryKey: ["/api/commerce/admin/features"], queryFn: () => apiRequest<FeatureRegistryItem[]>("/api/commerce/admin/features") });
  const details = useQuery({ queryKey: ["/api/commerce/admin/products", selectedProductId], enabled: Boolean(selectedProductId), queryFn: () => apiRequest<ProductDetails>(`/api/commerce/admin/products/${selectedProductId}`) });
  const orders = useQuery({ queryKey: ["/api/commerce/admin/orders"], queryFn: () => apiRequest<OrderAudit[]>("/api/commerce/admin/orders?limit=20") });
  const payments = useQuery({ queryKey: ["/api/commerce/admin/payments"], queryFn: () => apiRequest<PaymentAudit[]>("/api/commerce/admin/payments?limit=20") });
  const paymentEvents = useQuery({ queryKey: ["/api/commerce/admin/payment-events"], queryFn: () => apiRequest<PaymentEventAudit[]>("/api/commerce/admin/payment-events?limit=20") });
  const entitlements = useQuery({ queryKey: ["/api/commerce/admin/entitlements"], queryFn: () => apiRequest<EntitlementAudit[]>("/api/commerce/admin/entitlements") });
  const ledger = useQuery({ queryKey: ["/api/commerce/admin/ledger"], queryFn: () => apiRequest<LedgerAudit[]>("/api/commerce/admin/ledger?limit=20") });

  const invalidateProducts = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/commerce/admin/products"] });
  };

  const visibleProducts = pricingOnly
    ? products.data?.filter((product) => product.type === "platform_subscription" && product.scopeType === "platform" && !product.scopeId)
    : products.data;

  const saveProduct = useMutation({
    mutationFn: () => apiRequest<Product>(selectedProductId ? `/api/commerce/admin/products/${selectedProductId}` : "/api/commerce/admin/products", {
      method: selectedProductId ? "PATCH" : "POST",
      body: JSON.stringify({ ...productForm, scopeId: productForm.scopeId || null, sortOrder: Number(productForm.sortOrder || 0), metadata: { isPopular: productForm.isPopular } }),
    }),
    onSuccess: async (product) => { setSelectedProductId(product.id); await invalidateProducts(); toast({ title: "Продукт сохранён" }); },
    onError: (error) => toast({ title: "Ошибка сохранения", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/commerce/admin/products/${id}`, { method: "DELETE" }),
    onSuccess: async () => { setSelectedProductId(undefined); setProductForm(productDefaults); await invalidateProducts(); toast({ title: "Архивный тариф удалён" }); },
    onError: (error) => toast({ title: "Тариф не удалён", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

  const addPrice = useMutation({
    mutationFn: () => apiRequest(`/api/commerce/admin/products/${selectedProductId}/prices`, { method: "POST", body: JSON.stringify({ ...priceForm, amountRub: Number(priceForm.amountRub || 0) }) }),
    onSuccess: async () => { await details.refetch(); toast({ title: "Цена добавлена" }); },
  });

  const updatePrice = useMutation({
    mutationFn: (price: Price) => apiRequest(`/api/commerce/admin/prices/${price.id}`, { method: "PATCH", body: JSON.stringify({ status: price.status === "active" ? "archived" : "active" }) }),
    onSuccess: () => details.refetch(),
  });

  const addProductFeature = useMutation({
    mutationFn: () => apiRequest(`/api/commerce/admin/products/${selectedProductId}/features`, {
      method: "POST",
      body: JSON.stringify(productFeaturePayload(featureForm)),
    }),
    onSuccess: async () => { setFeatureForm(featureDefaults); await details.refetch(); toast({ title: "Право добавлено" }); },
    onError: (error) => toast({ title: "Право не добавлено", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });

  const updateProductFeature = useMutation({
    mutationFn: (feature: ProductFeature) => apiRequest(`/api/commerce/admin/product-features/${feature.id}`, { method: "PATCH", body: JSON.stringify(feature) }),
    onSuccess: () => details.refetch(),
  });

  const deleteProductFeature = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/commerce/admin/product-features/${id}`, { method: "DELETE" }),
    onSuccess: () => details.refetch(),
  });

  const saveRegistry = useMutation({
    mutationFn: () => apiRequest("/api/commerce/admin/features", { method: "POST", body: JSON.stringify({ ...registryForm, ...featureValuePayload(registryForm), description: registryForm.description || null }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["/api/commerce/admin/features"] }); toast({ title: "Правило доступа сохранено" }); },
  });

  return <AdminLayout><div className="container mx-auto space-y-6 px-4 py-8">
    <div><h1 className="text-3xl font-bold">Конструктор тарифов</h1><p className="text-muted-foreground">Продукты, цены, права доступа и аудит биллинга.</p></div>
    <Tabs defaultValue="products"><TabsList><TabsTrigger value="products">Тарифы</TabsTrigger><TabsTrigger value="features">Реестр прав</TabsTrigger><TabsTrigger value="audit">Аудит</TabsTrigger></TabsList>
      <TabsContent value="products" className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <ProductsCard query={products} products={visibleProducts} selectedProductId={selectedProductId} pricingOnly={pricingOnly} setPricingOnly={setPricingOnly} onSelect={(product) => { setSelectedProductId(product.id); setProductForm({ type: product.type, scopeType: product.scopeType, scopeId: product.scopeId ?? "", code: product.code, title: product.title, description: product.description ?? "", status: product.status, visibility: product.visibility, sortOrder: String(product.sortOrder), isPopular: Boolean(product.metadata?.isPopular) }); }} onDelete={(product) => deleteProduct.mutate(product.id)} />
        <ProductEditor form={productForm} setForm={setProductForm} save={() => saveProduct.mutate()} saving={saveProduct.isPending} reset={() => { setSelectedProductId(undefined); setProductForm(productDefaults); }} />
        <div className="xl:col-span-2"><ProductDetailsCard details={details.data} isLoading={details.isLoading} error={details.error} features={features.data ?? []} priceForm={priceForm} setPriceForm={setPriceForm} addPrice={() => addPrice.mutate()} updatePrice={(price) => updatePrice.mutate(price)} featureForm={featureForm} setFeatureForm={setFeatureForm} addFeature={() => addProductFeature.mutate()} updateFeature={(feature) => updateProductFeature.mutate(feature)} deleteFeature={(id) => deleteProductFeature.mutate(id)} /></div>
      </TabsContent>
      <TabsContent value="features" className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]"><FeatureRegistryList query={features} /><FeatureRegistryEditor form={registryForm} setForm={setRegistryForm} save={() => saveRegistry.mutate()} saving={saveRegistry.isPending} /></TabsContent>
      <TabsContent value="audit" className="mt-6"><AuditTab orders={orders} payments={payments} events={paymentEvents} entitlements={entitlements} ledger={ledger} /></TabsContent>
    </Tabs>
  </div></AdminLayout>;
}

function ProductsCard({ query, products, selectedProductId, pricingOnly, setPricingOnly, onSelect, onDelete }: Readonly<{ query: ReturnType<typeof useQuery<Product[]>>; products?: Product[]; selectedProductId?: string; pricingOnly: boolean; setPricingOnly: (value: boolean) => void; onSelect: (product: Product) => void; onDelete: (product: Product) => void }>) {
  return <Card><CardHeader><CardTitle>Тарифы</CardTitle><CardDescription>Тарифные продукты и области действия.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex items-center gap-2 rounded-lg border p-3"><Switch checked={pricingOnly} onCheckedChange={setPricingOnly} /><Label>Только карточки /pricing</Label></div>{query.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{query.error ? <ErrorState error={query.error} /> : null}{products?.map((product) => <div key={product.id} className={`rounded-lg border p-3 sm:p-4 ${selectedProductId === product.id ? "border-primary" : ""}`}><button type="button" onClick={() => onSelect(product)} className="w-full min-w-0 text-left hover:bg-muted/50"><div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="break-words font-medium">{product.title}</div><div className="break-all text-sm text-muted-foreground">{product.code} · {labelOf(productTypeLabels, product.type)} · {labelOf(scopeTypeLabels, product.scopeType)}{product.scopeId ? `:${product.scopeId}` : ""}</div></div><div className="flex shrink-0 flex-wrap gap-2"><Badge variant={product.status === "active" ? "default" : "secondary"}>{labelOf(statusLabels, product.status)}</Badge>{product.metadata?.isPopular ? <Badge variant="outline">Популярный</Badge> : null}</div></div></button>{product.status === "archived" ? <Button type="button" size="sm" variant="destructive" className="mt-3 w-full gap-2 sm:w-auto" onClick={() => onDelete(product)}><Trash2 className="h-4 w-4" />Удалить архивный тариф</Button> : null}</div>)}{!query.isLoading && products?.length === 0 ? <EmptyState text={pricingOnly ? "Публичных платформенных тарифов пока нет." : "Тарифов пока нет."} /> : null}</CardContent></Card>;
}

function ProductEditor({ form, setForm, save, saving, reset }: Readonly<{ form: typeof productDefaults; setForm: (value: typeof productDefaults) => void; save: () => void; saving: boolean; reset: () => void }>) {
  return <Card><CardHeader><CardTitle>Редактор тарифа</CardTitle></CardHeader><CardContent className="space-y-4"><Field label="Название"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><Field label="Код"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field><Field label="Описание"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Тип"><Select value={form.type} onValueChange={(type) => setForm({ ...form, type: type as ProductType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["platform_subscription", "club_subscription", "reader_club_subscription", "ticket", "recording_access", "donation"].map((item) => <SelectItem key={item} value={item}>{labelOf(productTypeLabels, item)}</SelectItem>)}</SelectContent></Select></Field><Field label="Область"><Select value={form.scopeType} onValueChange={(scopeType) => setForm({ ...form, scopeType: scopeType as ScopeType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["platform", "club", "reader_club", "session", "recording", "reader"].map((item) => <SelectItem key={item} value={item}>{labelOf(scopeTypeLabels, item)}</SelectItem>)}</SelectContent></Select></Field></div><Field label="ID области"><Input value={form.scopeId} onChange={(e) => setForm({ ...form, scopeId: e.target.value })} /></Field><div className="grid grid-cols-3 gap-3"><Field label="Статус"><Select value={form.status} onValueChange={(status) => setForm({ ...form, status: status as Status })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">Черновик</SelectItem><SelectItem value="active">Активен</SelectItem><SelectItem value="archived">В архиве</SelectItem></SelectContent></Select></Field><Field label="Видимость"><Select value={form.visibility} onValueChange={(visibility) => setForm({ ...form, visibility: visibility as Visibility })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">Скрыт</SelectItem><SelectItem value="public">Публичный</SelectItem></SelectContent></Select></Field><Field label="Сортировка"><Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field></div><div className="flex items-center gap-2 rounded-lg border p-3"><Switch checked={form.isPopular} onCheckedChange={(isPopular) => setForm({ ...form, isPopular })} /><Label>Популярный на /pricing</Label></div><div className="flex gap-2"><Button onClick={save} disabled={saving || !form.title || !form.code} className="gap-2"><Save className="h-4 w-4" />Сохранить</Button><Button variant="outline" onClick={reset}>Новый</Button></div></CardContent></Card>;
}

function ProductDetailsCard(props: Readonly<{ details?: ProductDetails; isLoading: boolean; error: unknown; features: FeatureRegistryItem[]; priceForm: typeof priceDefaults; setPriceForm: (value: typeof priceDefaults) => void; addPrice: () => void; updatePrice: (price: Price) => void; featureForm: typeof featureDefaults; setFeatureForm: (value: typeof featureDefaults) => void; addFeature: () => void; updateFeature: (feature: ProductFeature) => void; deleteFeature: (id: string) => void }>) {
  const { details, isLoading, error, features, priceForm, setPriceForm, addPrice, updatePrice, featureForm, setFeatureForm, addFeature, updateFeature, deleteFeature } = props;
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  if (isLoading) return <Card><CardContent className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  if (error) return <ErrorState error={error} />;
  if (!details) return <EmptyState text="Выберите тариф, чтобы редактировать цены и права доступа." />;
  return <Card><CardHeader><CardTitle>Цены, права и предпросмотр</CardTitle><CardDescription>Предпросмотр показывает, как платформенный тариф будет выглядеть на /pricing.</CardDescription></CardHeader><CardContent className="grid min-w-0 gap-6 lg:grid-cols-3"><div className="min-w-0 space-y-4"><h3 className="font-medium">Цены</h3>{details.prices.map((price) => <div key={price.id} className="flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="break-words">{price.amountRub.toLocaleString("ru-RU")} ₽ / {labelOf(periodLabels, price.period)} · {price.status === "active" ? "активна" : "в архиве"}{price.isDefault ? " · по умолчанию" : ""}</span><Button size="sm" variant="outline" onClick={() => updatePrice(price)}>{price.status === "active" ? "В архив" : "Активировать"}</Button></div>)}<div className="grid gap-2 sm:grid-cols-3"><Input type="number" value={priceForm.amountRub} onChange={(e) => setPriceForm({ ...priceForm, amountRub: e.target.value })} /><Select value={priceForm.period} onValueChange={(period) => setPriceForm({ ...priceForm, period: period as Period })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["one_time", "week", "month", "quarter", "year"].map((item) => <SelectItem key={item} value={item}>{labelOf(periodLabels, item)}</SelectItem>)}</SelectContent></Select><Button onClick={addPrice} className="gap-2"><Plus className="h-4 w-4" />Цена</Button></div></div><div className="min-w-0 space-y-4"><h3 className="font-medium">Права тарифа</h3>{details.features.map((feature) => <ProductFeatureRow key={feature.id} feature={feature} features={features} isEditing={editingFeatureId === feature.id} onEdit={() => setEditingFeatureId(feature.id)} onCancel={() => setEditingFeatureId(null)} onSave={(next) => { updateFeature(next); setEditingFeatureId(null); }} onDelete={() => deleteFeature(feature.id)} />)}<FeatureValueEditor form={featureForm} setForm={setFeatureForm} features={features} /><Button onClick={addFeature} disabled={!featureForm.featureKey.trim()} className="gap-2"><Plus className="h-4 w-4" />Право</Button>{!featureForm.featureKey.trim() ? <p className="text-xs text-muted-foreground">Выберите ключ из списка или введите кастомный ключ вручную.</p> : null}</div><PricingPreview product={details} /></CardContent></Card>;
}

function formFromFeature(feature: ProductFeature) {
  return { label: feature.label, featureKey: feature.featureKey, valueType: feature.valueType, valueBool: feature.valueBool ?? true, valueInt: feature.valueInt?.toString() ?? "", valueText: feature.valueText ?? "", valueJson: feature.valueJson ? JSON.stringify(feature.valueJson) : "", resetPeriod: feature.resetPeriod ?? "none", sortOrder: feature.sortOrder.toString(), isHighlighted: feature.isHighlighted, isActive: feature.isActive };
}

function featureFromForm(feature: ProductFeature, form: ReturnType<typeof formFromFeature>): ProductFeature {
  const value = featureValuePayload(form);
  return { ...feature, ...form, valueBool: value.valueBool ?? null, valueInt: value.valueInt ?? null, valueText: value.valueText ?? null, valueJson: value.valueJson ?? null, resetPeriod: form.resetPeriod === "none" ? null : form.resetPeriod as ResetPeriod, sortOrder: Number(form.sortOrder || 0) };
}

function ProductFeatureRow(props: Readonly<{ feature: ProductFeature; features: FeatureRegistryItem[]; isEditing: boolean; onEdit: () => void; onCancel: () => void; onSave: (feature: ProductFeature) => void; onDelete: () => void }>) {
  const { feature, features, isEditing, onEdit, onCancel, onSave, onDelete } = props;
  const [form, setForm] = useState(formFromFeature(feature));
  const support = getCommerceFeatureSupport(feature.featureKey);
  if (isEditing) return <div className="space-y-3 rounded-lg border p-3 text-sm"><FeatureValueEditor form={form} setForm={setForm} features={features} /><div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2"><Switch checked={form.isHighlighted} onCheckedChange={(isHighlighted) => setForm({ ...form, isHighlighted })} /><Label>Выделить</Label></div><div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(isActive) => setForm({ ...form, isActive })} /><Label>Активно</Label></div><Button size="sm" onClick={() => onSave(featureFromForm(feature, form))}>Сохранить</Button><Button size="sm" variant="outline" onClick={onCancel}>Отмена</Button></div></div>;
  return <div className={`rounded-lg border p-3 text-sm ${feature.isActive ? "" : "bg-muted/40"}`}><div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><span className="max-w-full break-words font-medium">{feature.label}</span>{feature.isActive ? null : <Badge variant="secondary">Архив</Badge>}{feature.isHighlighted ? <Badge variant="outline">Highlight</Badge> : null}<SupportBadge featureKey={feature.featureKey} /></div><div className="break-all text-muted-foreground">{feature.featureKey} · {labelOf(valueTypeLabels, feature.valueType)} · {formatFeatureValue(feature)}</div>{support.status !== "implemented" ? <div className="mt-1 break-words text-xs text-amber-700">{support.note}</div> : null}</div><div className="flex shrink-0 gap-2 self-end sm:self-start"><Button size="icon" variant="outline" onClick={() => { setForm(formFromFeature(feature)); onEdit(); }}><Eye className="h-4 w-4" /></Button>{feature.isActive ? <Button size="icon" variant="destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button> : <Button size="icon" variant="outline" onClick={() => onSave({ ...feature, isActive: true })}><RotateCcw className="h-4 w-4" /></Button>}</div></div></div>;
}

function PricingPreview({ product }: Readonly<{ product: ProductDetails }>) {
  const price = product.prices.find((item) => item.isDefault && item.status === "active") ?? product.prices.find((item) => item.status === "active");
  const isPricingProduct = product.type === "platform_subscription" && product.scopeType === "platform" && !product.scopeId;
  return <div className="space-y-4"><h3 className="font-medium">Предпросмотр /pricing</h3><div className={`relative rounded-xl border p-5 ${product.metadata?.isPopular ? "border-amber-500 shadow-lg" : ""}`}>{product.metadata?.isPopular ? <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 px-3 py-1 text-xs font-bold text-white">Популярный выбор</div> : null}<div className="text-xl font-semibold">{product.title || "Название тарифа"}</div><p className="mt-1 text-sm text-muted-foreground">{product.description || "Описание тарифа"}</p><div className="my-5"><span className="text-3xl font-bold">{price ? `${price.amountRub.toLocaleString("ru-RU")} ₽` : "Цена не задана"}</span>{price && price.period !== "one_time" ? <span className="text-muted-foreground"> / {labelOf(periodLabels, price.period)}</span> : null}</div><ul className="space-y-2 text-sm">{product.features.filter((feature) => feature.isActive).map((feature) => <li key={feature.id}>✓ {feature.label}</li>)}</ul><Button className="mt-5 w-full" disabled={!price || !isPricingProduct}>{price?.amountRub === 0 ? "Начать бесплатно" : "Оформить подписку"}</Button></div>{!isPricingProduct ? <p className="text-xs text-destructive">Этот тариф не попадёт на /pricing: нужен тип «Подписка платформы», область «Вся платформа» и пустой ID области.</p> : null}</div>;
}

function FeatureValueEditor({ form, setForm, features }: Readonly<{ form: typeof featureDefaults; setForm: (value: typeof featureDefaults) => void; features: FeatureRegistryItem[] }>) {
  const selectedFeature = features.find((item) => item.key === form.featureKey);
  const support = form.featureKey ? getCommerceFeatureSupport(form.featureKey) : null;
  const selectFeature = (featureKey: string) => {
    const registry = features.find((item) => item.key === featureKey);
    setForm({ ...form, featureKey, label: registry?.title ?? form.label, valueType: registry?.valueType ?? form.valueType });
  };

  return <div className="grid min-w-0 gap-3"><div className="grid min-w-0 gap-3 sm:grid-cols-2"><div className="relative min-w-0"><Input placeholder="Ключ права, например club.books.max_count" value={form.featureKey} onChange={(e) => setForm({ ...form, featureKey: e.target.value.trim() })} className="pr-9 font-mono text-xs sm:text-sm" />{form.featureKey ? <Button type="button" size="icon" variant="ghost" aria-label="Очистить ключ права" className="absolute right-1 top-1 h-8 w-8" onClick={() => setForm({ ...form, featureKey: "" })}><X className="h-4 w-4" /></Button> : null}</div><Input placeholder="Название" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="min-w-0" /></div><Select value={selectedFeature?.key ?? "none"} onValueChange={selectFeature}><SelectTrigger className="h-auto min-h-12 w-full items-start text-left"><div className="min-w-0 flex-1 overflow-hidden"><SelectValue placeholder="Выбрать из реестра" />{selectedFeature ? <span className="block truncate text-xs text-muted-foreground">{selectedFeature.title}</span> : null}</div></SelectTrigger><SelectContent className="max-h-[min(420px,calc(100vh-160px))] overflow-y-auto"><SelectItem value="none" disabled>Выбрать из реестра</SelectItem>{features.map((feature) => <SelectItem key={feature.key} value={feature.key}><span className="flex min-w-0 flex-col gap-0.5"><span className="break-words">{feature.title}</span><span className="break-all font-mono text-xs text-muted-foreground">{feature.key}</span><span className="text-xs text-muted-foreground">{supportStatusLabels[getCommerceFeatureSupport(feature.key).status]}</span></span></SelectItem>)}</SelectContent></Select>{support ? <div className="flex min-w-0 flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"><SupportBadge featureKey={form.featureKey} />{support.status !== "implemented" ? <span className="break-words text-amber-700">{support.note}</span> : <span className="break-words text-muted-foreground">{support.note}</span>}</div> : null}<div className="grid min-w-0 gap-3 sm:grid-cols-2"><Select value={form.valueType} onValueChange={(valueType) => setForm({ ...form, valueType: valueType as ValueType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="boolean">{valueTypeLabels.boolean}</SelectItem><SelectItem value="integer">{valueTypeLabels.integer}</SelectItem><SelectItem value="string">{valueTypeLabels.string}</SelectItem><SelectItem value="json">{valueTypeLabels.json}</SelectItem></SelectContent></Select>{form.valueType === "boolean" ? <div className="flex min-h-10 items-center gap-2"><Switch checked={form.valueBool} onCheckedChange={(valueBool) => setForm({ ...form, valueBool })} /><Label>Значение</Label></div> : null}{form.valueType === "integer" ? <Input placeholder="Числовое значение" type="number" value={form.valueInt} onChange={(e) => setForm({ ...form, valueInt: e.target.value })} /> : null}{form.valueType === "string" ? <Input placeholder="Текстовое значение" value={form.valueText} onChange={(e) => setForm({ ...form, valueText: e.target.value })} /> : null}{form.valueType === "json" ? <Textarea placeholder='JSON, например {"limit":10}' value={form.valueJson} onChange={(e) => setForm({ ...form, valueJson: e.target.value })} className="sm:col-span-2" /> : null}<Select value={form.resetPeriod} onValueChange={(resetPeriod) => setForm({ ...form, resetPeriod })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{resetPeriodLabels.none}</SelectItem><SelectItem value="day">{resetPeriodLabels.day}</SelectItem><SelectItem value="week">{resetPeriodLabels.week}</SelectItem><SelectItem value="month">{resetPeriodLabels.month}</SelectItem><SelectItem value="year">{resetPeriodLabels.year}</SelectItem></SelectContent></Select><Input placeholder="Порядок сортировки" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></div></div>;
}

function SupportBadge({ featureKey }: Readonly<{ featureKey: string }>) {
  const support = getCommerceFeatureSupport(featureKey);
  return <Badge variant={support.status === "implemented" ? "default" : "secondary"} className="max-w-full whitespace-normal break-words text-left leading-tight">{supportStatusLabels[support.status]}</Badge>;
}

function FeatureRegistryList({ query }: Readonly<{ query: ReturnType<typeof useQuery<FeatureRegistryItem[]>> }>) {
  return <Card><CardHeader><CardTitle>Реестр прав</CardTitle><CardDescription>Глобальные значения по умолчанию и типы прав.</CardDescription></CardHeader><CardContent className="max-h-[560px] space-y-3 overflow-y-auto pr-2">{query.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{query.error ? <ErrorState error={query.error} /> : null}{query.data?.map((feature) => <div key={feature.key} className="rounded-lg border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium">{feature.title}</div><Badge variant={feature.isActive ? "default" : "secondary"}>{labelOf(valueTypeLabels, feature.valueType)}</Badge></div><div className="text-sm text-muted-foreground">{feature.key} · {labelOf(categoryLabels, feature.category)} · по умолчанию: {formatRegistryDefault(feature)}</div></div>)}{!query.isLoading && query.data?.length === 0 ? <EmptyState text="Реестр прав пуст." /> : null}</CardContent></Card>;
}

function FeatureRegistryEditor({ form, setForm, save, saving }: Readonly<{ form: typeof registryDefaults; setForm: (value: typeof registryDefaults) => void; save: () => void; saving: boolean }>) {
  return <Card><CardHeader><CardTitle>Редактор права</CardTitle></CardHeader><CardContent className="space-y-4"><Field label="Ключ"><Input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></Field><Field label="Название"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field><Field label="Описание"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field><Field label="Категория"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field><Select value={form.valueType} onValueChange={(valueType) => setForm({ ...form, valueType: valueType as ValueType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="boolean">{valueTypeLabels.boolean}</SelectItem><SelectItem value="integer">{valueTypeLabels.integer}</SelectItem><SelectItem value="string">{valueTypeLabels.string}</SelectItem><SelectItem value="json">{valueTypeLabels.json}</SelectItem></SelectContent></Select>{form.valueType === "boolean" ? <div className="flex items-center gap-2"><Switch checked={form.defaultBool} onCheckedChange={(defaultBool) => setForm({ ...form, defaultBool })} /><Label>Значение по умолчанию</Label></div> : null}{form.valueType === "integer" ? <Field label="Число по умолчанию"><Input type="number" value={form.defaultInt} onChange={(e) => setForm({ ...form, defaultInt: e.target.value })} /></Field> : null}{form.valueType === "string" ? <Field label="Текст по умолчанию"><Input value={form.defaultText} onChange={(e) => setForm({ ...form, defaultText: e.target.value })} /></Field> : null}{form.valueType === "json" ? <Field label="JSON по умолчанию"><Textarea value={form.defaultJson} onChange={(e) => setForm({ ...form, defaultJson: e.target.value })} /></Field> : null}<div className="flex gap-4"><div className="flex items-center gap-2"><Switch checked={form.isPublic} onCheckedChange={(isPublic) => setForm({ ...form, isPublic })} /><Label>Публичное</Label></div><div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={(isActive) => setForm({ ...form, isActive })} /><Label>Активно</Label></div></div><Button onClick={save} disabled={saving || !form.key || !form.title} className="gap-2"><Save className="h-4 w-4" />Сохранить</Button></CardContent></Card>;
}

function AuditTab(props: Readonly<{ orders: ReturnType<typeof useQuery<OrderAudit[]>>; payments: ReturnType<typeof useQuery<PaymentAudit[]>>; events: ReturnType<typeof useQuery<PaymentEventAudit[]>>; entitlements: ReturnType<typeof useQuery<EntitlementAudit[]>>; ledger: ReturnType<typeof useQuery<LedgerAudit[]>> }>) {
  const { orders, payments, events, entitlements, ledger } = props;
  return <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Заказы</CardTitle><CardDescription>/api/commerce/admin/orders</CardDescription></CardHeader><CardContent className="max-h-[520px] space-y-3 overflow-y-auto pr-2">{orders.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{orders.error ? <ErrorState error={orders.error} /> : null}{orders.data?.map((order) => <div key={order.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{labelOf(auditStatusLabels, order.status)}</b><span>{order.amountRub} ₽</span></div><div className="text-muted-foreground">{order.id}</div><div className="text-muted-foreground">Пользователь: {order.userId}</div></div>)}{!orders.isLoading && orders.data?.length === 0 ? <EmptyState text="Заказов пока нет." /> : null}</CardContent></Card><Card><CardHeader><CardTitle>Платежи</CardTitle><CardDescription>/api/commerce/admin/payments → audit-chain/:paymentId</CardDescription></CardHeader><CardContent className="max-h-[520px] space-y-3 overflow-y-auto pr-2">{payments.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{payments.error ? <ErrorState error={payments.error} /> : null}{payments.data?.map((payment) => <div key={payment.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>{labelOf(auditStatusLabels, payment.status)}</b><span>{payment.amountRub} ₽</span></div><div className="text-muted-foreground">Локальный ID: {payment.id}</div><div className="text-muted-foreground">ID провайдера: {payment.providerPaymentId ?? "—"}</div>{payment.fiscalReceiptId ? <div className="text-muted-foreground">Чек: {payment.fiscalReceiptId}</div> : null}</div>)}{!payments.isLoading && payments.data?.length === 0 ? <EmptyState text="Платежей пока нет." /> : null}</CardContent></Card><AuditList title="События платежей" endpoint="/api/commerce/admin/payment-events" query={events} render={(item) => `${labelOf(eventTypeLabels, item.eventType)} · ${labelOf(auditStatusLabels, item.status)} · ${item.providerPaymentId ?? "—"}`} /><AuditList title="Права доступа" endpoint="/api/commerce/admin/entitlements" query={entitlements} render={(item) => `${item.featureKey} · ${labelOf(auditStatusLabels, item.status)} · источник: ${labelOf(sourceTypeLabels, item.sourceType)}${item.sourceId ? ` (${item.sourceId})` : ""}`} /><AuditList title="Финансовый журнал" endpoint="/api/commerce/admin/ledger" query={ledger} render={(item) => `${labelOf(ledgerTypeLabels, item.entryType)} · ${(item.amountKopecks / 100).toLocaleString("ru-RU")} ₽ · ${labelOf(auditStatusLabels, item.status)}`} /></div>;
}

function AuditList<T extends { id: string }>(props: Readonly<{ title: string; endpoint: string; query: ReturnType<typeof useQuery<T[]>>; render: (item: T) => string }>) {
  const { title, endpoint, query, render } = props;
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{endpoint}</CardDescription></CardHeader><CardContent className="max-h-[520px] space-y-3 overflow-y-auto pr-2">{query.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}{query.error ? <ErrorState error={query.error} /> : null}{query.data?.slice(0, 20).map((item) => <div key={item.id} className="rounded-lg border p-3 text-sm"><div>{render(item)}</div><div className="text-muted-foreground">{item.id}</div></div>)}{!query.isLoading && query.data?.length === 0 ? <EmptyState text="Записей пока нет." /> : null}</CardContent></Card>;
}

function formatFeatureValue(feature: ProductFeature) {
  if (feature.valueType === "integer") return feature.valueInt ?? "—";
  if (feature.valueType === "string") return feature.valueText ?? "—";
  if (feature.valueType === "json") return JSON.stringify(feature.valueJson ?? null);
  return feature.valueBool ?? true ? "Да" : "Нет";
}

function formatRegistryDefault(feature: FeatureRegistryItem) {
  if (feature.valueType === "integer") return feature.defaultInt ?? "—";
  if (feature.valueType === "string") return feature.defaultText ?? "—";
  if (feature.valueType === "json") return JSON.stringify(feature.defaultJson ?? null);
  return feature.defaultBool ?? false ? "Да" : "Нет";
}
