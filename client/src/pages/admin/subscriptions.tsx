import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type ActionType = "revoke_now" | "cancel_at_period_end" | "restore" | "delete_revoked";
type SortKey = "created" | "user" | "product" | "status" | "price";
type GroupKey = "none" | "status" | "product" | "period";

interface SubscriptionRow {
  entitlement: { id: string; userId: string; status: string; renewalStatus: "active" | "cancel_at_period_end"; renewalCancelledAt: string | null; featureKey: string; startsAt: string; endsAt: string | null; createdAt: string };
  user: { id: string; username: string; email: string } | null;
  product: { id: string; title: string; type: string } | null;
  price: { id: string; amountRub: number; period: string } | null;
  payment: { id: string; providerPaymentId: string | null; status: string; fiscalReceiptUrl: string | null } | null;
}

interface SubscriptionsResponse { items: SubscriptionRow[]; total: number; }

interface RowHandlers {
  checked: boolean;
  inlineAction: { id: string; actionType: ActionType } | null;
  reason: string;
  pending: boolean;
  onToggle: (id: string) => void;
  onOpenInline: (id: string, actionType: ActionType) => void;
  onReason: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

const QUERY_KEY = ["/api/commerce/admin/subscriptions"] as const;

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

function formatPeriod(period?: string) {
  const labels: Record<string, string> = { week: "неделя", month: "месяц", quarter: "квартал", year: "год", one_time: "разово" };
  return labels[period ?? ""] ?? "—";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { active: "Активна", revoked: "Отозвана", expired: "Истекла", deleted: "Удалена" };
  return labels[status] ?? status;
}

function renewalLabel(item: SubscriptionRow) {
  if (item.entitlement.renewalStatus !== "cancel_at_period_end") return "Продление активно";
  return `Продление отменено, доступ до ${formatDate(item.entitlement.endsAt)}`;
}

function priceLabel(item: SubscriptionRow) {
  if (!item.price) return "—";
  return `${item.price.amountRub.toLocaleString("ru-RU")} ₽ / ${formatPeriod(item.price.period)}`;
}

function compareRows(a: SubscriptionRow, b: SubscriptionRow, sort: SortKey) {
  if (sort === "user") return (a.user?.email ?? "").localeCompare(b.user?.email ?? "");
  if (sort === "product") return (a.product?.title ?? a.entitlement.featureKey).localeCompare(b.product?.title ?? b.entitlement.featureKey);
  if (sort === "status") return a.entitlement.status.localeCompare(b.entitlement.status);
  if (sort === "price") return (b.price?.amountRub ?? 0) - (a.price?.amountRub ?? 0);
  return new Date(b.entitlement.createdAt).getTime() - new Date(a.entitlement.createdAt).getTime();
}

function groupTitle(row: SubscriptionRow, group: GroupKey) {
  if (group === "status") return statusLabel(row.entitlement.status);
  if (group === "product") return row.product?.title ?? row.entitlement.featureKey;
  if (group === "period") return formatPeriod(row.price?.period);
  return "Все подписки";
}

export default function AdminSubscriptionsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("created");
  const [group, setGroup] = useState<GroupKey>("none");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [inlineAction, setInlineAction] = useState<{ id: string; actionType: ActionType } | null>(null);
  const [reason, setReason] = useState("");
  const offset = (page - 1) * pageSize;
  const params = new URLSearchParams({ limit: String(pageSize), offset: String(offset) });
  if (status !== "all") params.set("status", status);
  if (search.trim()) params.set("search", search.trim());

  const subscriptions = useQuery({
    queryKey: [...QUERY_KEY, status, search, page, pageSize],
    queryFn: () => apiRequest<SubscriptionsResponse>(`/api/commerce/admin/subscriptions?${params.toString()}`),
  });

  const total = subscriptions.data?.total ?? 0;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const rows = useMemo(() => [...(subscriptions.data?.items ?? [])].sort((a, b) => compareRows(a, b, sort)), [subscriptions.data, sort]);
  const groupedRows = useMemo(() => {
    const map = new Map<string, SubscriptionRow[]>();
    rows.forEach((row) => {
      const title = groupTitle(row, group);
      map.set(title, [...(map.get(title) ?? []), row]);
    });
    return [...map.entries()];
  }, [group, rows]);

  const action = useMutation({
    mutationFn: async ({ ids, actionType, actionReason }: { ids: string[]; actionType: ActionType; actionReason: string }) => {
      if (ids.length === 0) throw new Error("Выберите подписки");
      if (actionReason.trim().length < 3) throw new Error("Укажите причину");
      await Promise.all(ids.map((id) => apiRequest(`/api/commerce/admin/subscriptions/${id}/action`, {
        method: "POST",
        body: JSON.stringify({ actionType, reason: actionReason.trim() }),
      })));
    },
    onSuccess: async () => {
      setInlineAction(null);
      setSelectedIds([]);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: "Подписки обновлены", description: "Действия сохранены в audit." });
    },
    onError: (error) => toast({ variant: "destructive", title: "Ошибка", description: error instanceof Error ? error.message : "Не удалось обновить подписки" }),
  });

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function openInline(id: string, actionType: ActionType) {
    setInlineAction({ id, actionType });
    setReason(actionType === "restore" ? "Восстановление подписки администратором" : actionType === "delete_revoked" ? "Окончательное скрытие отозванной подписки" : "");
  }

  function selectedByStatus(targetStatus: string) {
    return selectedIds.filter((id) => rows.some((row) => row.entitlement.id === id && row.entitlement.status === targetStatus));
  }

  function selectedActiveRenewing() {
    return selectedIds.filter((id) => rows.some((row) => row.entitlement.id === id && row.entitlement.status === "active" && row.entitlement.renewalStatus !== "cancel_at_period_end"));
  }

  function selectVisibleRows() {
    setSelectedIds(rows.map((row) => row.entitlement.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function resetPage(next: () => void) {
    setPage(1);
    setSelectedIds([]);
    next();
  }

  const rowHandlers: Omit<RowHandlers, "checked"> = {
    inlineAction,
    reason,
    pending: action.isPending,
    onToggle: toggleSelected,
    onOpenInline: openInline,
    onReason: setReason,
    onCancel: () => setInlineAction(null),
    onSubmit: () => inlineAction && action.mutate({ ids: [inlineAction.id], actionType: inlineAction.actionType, actionReason: reason }),
  };

  return (
    <AdminLayout>
      <main className="space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-6">
        <header className="shrink-0 space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl lg:text-3xl">
            <BadgeCheck className="h-5 w-5 shrink-0 sm:h-6 sm:w-6 lg:h-7 lg:w-7" />
            <span>Подписки пользователей</span>
          </h1>
          <p className="text-sm text-muted-foreground">Управление доступом, продлением и статусами пользовательских подписок.</p>
        </header>

        <Card className="shrink-0">
          <CardHeader className="space-y-1 p-4 pb-2 sm:p-5 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Фильтры и массовые действия</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Удаление — безопасный статус `deleted`, audit-chain сохраняется.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 p-4 pt-2 sm:grid-cols-2 sm:p-5 sm:pt-2 lg:grid-cols-[150px_minmax(220px,280px)_170px_170px_auto] xl:grid-cols-[150px_minmax(240px,320px)_170px_170px_auto]">
            <FilterSelect label="Статус" value={status} onValueChange={(value) => resetPage(() => setStatus(value))} items={[['active', 'Активные'], ['revoked', 'Отозванные'], ['expired', 'Истёкшие'], ['deleted', 'Удалённые'], ['all', 'Все']]} />
            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
              <Label>Email</Label>
              <Input value={search} onChange={(event) => resetPage(() => setSearch(event.target.value))} placeholder="user@example.com" />
            </div>
            <FilterSelect label="Сортировка" value={sort} onValueChange={(value) => setSort(value as SortKey)} items={[['created', 'Новые сверху'], ['user', 'Пользователь'], ['product', 'Тариф'], ['status', 'Статус'], ['price', 'Стоимость']]} />
            <FilterSelect label="Группировка" value={group} onValueChange={(value) => setGroup(value as GroupKey)} items={[['none', 'Без группировки'], ['status', 'По статусу'], ['product', 'По тарифу'], ['period', 'По периоду']]} />
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4 lg:col-span-1 lg:flex lg:items-end lg:justify-end">
              <Button size="sm" variant="secondary" disabled={rows.length === 0} onClick={selectVisibleRows}>Все</Button>
              <Button size="sm" variant="ghost" disabled={selectedIds.length === 0} onClick={clearSelection}>Снять</Button>
              <Button size="sm" variant="outline" disabled={selectedByStatus("active").length === 0 || action.isPending} onClick={() => action.mutate({ ids: selectedByStatus("active"), actionType: "revoke_now", actionReason: "Массовый отзыв администратором" })}>Отозвать</Button>
              <Button size="sm" variant="outline" disabled={selectedActiveRenewing().length === 0 || action.isPending} onClick={() => action.mutate({ ids: selectedActiveRenewing(), actionType: "cancel_at_period_end", actionReason: "Массовая отмена продления администратором" })}>Отменить</Button>
              <Button size="sm" variant="outline" disabled={selectedByStatus("revoked").length === 0 || action.isPending} onClick={() => action.mutate({ ids: selectedByStatus("revoked"), actionType: "delete_revoked", actionReason: "Массовое окончательное скрытие" })}>Удалить</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2 sm:p-5 sm:pb-3"><CardTitle className="text-base sm:text-lg">Список подписок</CardTitle><CardDescription>{total > 0 ? `Показаны ${offset + 1}–${Math.min(offset + rows.length, total)} из ${total}` : "Нет записей по текущим фильтрам"}</CardDescription></CardHeader>
          <CardContent className="space-y-4 p-3 pt-0 sm:p-5 sm:pt-0">
            {subscriptions.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Загружаем...</div>}
            {!subscriptions.isLoading && rows.length === 0 && <div className="text-sm text-muted-foreground">Подписки не найдены.</div>}
            {groupedRows.map(([title, items]) => (
              <section key={title} className="mb-5 space-y-3">
                {group !== "none" && <h2 className="sticky top-0 z-10 rounded-md bg-background/95 py-2 text-sm font-medium backdrop-blur">{title} · {items.length}</h2>}
                <div className="grid gap-3 lg:hidden">
                  {items.map((item) => <MobileCard key={item.entitlement.id} item={item} checked={selectedIds.includes(item.entitlement.id)} {...rowHandlers} />)}
                </div>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-background text-left text-muted-foreground">
                      <tr><th className="w-8 p-2" /><th className="p-2">Пользователь</th><th className="p-2">Тариф</th><th className="p-2">Период</th><th className="p-2">Доступ</th><th className="p-2">Платёж</th><th className="p-2">Действия</th></tr>
                    </thead>
                    <tbody>{items.map((item) => <TableRow key={item.entitlement.id} item={item} checked={selectedIds.includes(item.entitlement.id)} {...rowHandlers} />)}</tbody>
                  </table>
                </div>
              </section>
            ))}
            <Pagination page={page} totalPages={totalPages} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(value) => { setPageSize(value); setPage(1); setSelectedIds([]); }} />
          </CardContent>
        </Card>
      </main>
    </AdminLayout>
  );
}

function FilterSelect(props: Readonly<{ label: string; value: string; onValueChange: (value: string) => void; items: Array<[string, string]> }>) {
  return <div className="space-y-1"><Label>{props.label}</Label><Select value={props.value} onValueChange={props.onValueChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{props.items.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>;
}

function Pagination(props: Readonly<{ page: number; totalPages: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize: (pageSize: number) => void }>) {
  const { page, totalPages, pageSize, total, onPage, onPageSize } = props;
  return <div className="flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:items-center sm:justify-between"><div className="text-muted-foreground">Страница {page} из {totalPages} · всего {total}</div><div className="flex flex-wrap items-center gap-2"><Select value={String(pageSize)} onValueChange={(value) => onPageSize(Number(value))}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent>{[10, 25, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} / стр.</SelectItem>)}</SelectContent></Select><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(1)}>В начало</Button><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Вперёд</Button></div></div>;
}

function InlineReason({ visible, reason, pending, onReason, onSubmit, onCancel }: Readonly<{ visible: boolean; reason: string; pending: boolean; onReason: (value: string) => void; onSubmit: () => void; onCancel: () => void }>) {
  if (!visible) return null;
  return <div className="rounded-lg border bg-amber-50/70 p-3"><div className="space-y-2"><Label>Причина действия</Label><Textarea value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Причина будет сохранена в audit" /><div className="grid gap-2 sm:flex"><Button size="sm" onClick={onSubmit} disabled={pending}>{pending ? "Сохраняем..." : "Подтвердить"}</Button><Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>Отмена</Button></div></div></div>;
}

function Actions({ item, onOpenInline }: Readonly<{ item: SubscriptionRow; onOpenInline: (id: string, actionType: ActionType) => void }>) {
  const renewalCancelled = item.entitlement.renewalStatus === "cancel_at_period_end";
  return <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:flex-nowrap"><Button size="sm" variant="destructive" disabled={item.entitlement.status !== "active"} onClick={() => onOpenInline(item.entitlement.id, "revoke_now")}>Отозвать</Button><Button size="sm" variant="outline" disabled={item.entitlement.status !== "active" || renewalCancelled} onClick={() => onOpenInline(item.entitlement.id, "cancel_at_period_end")}>{renewalCancelled ? "Отменено" : "Отменить"}</Button><Button size="sm" variant="outline" disabled={!['revoked', 'deleted'].includes(item.entitlement.status)} onClick={() => onOpenInline(item.entitlement.id, "restore")}>Вернуть</Button><Button size="sm" variant="outline" disabled={item.entitlement.status !== "revoked"} onClick={() => onOpenInline(item.entitlement.id, "delete_revoked")}>Удалить</Button></div>;
}

function MobileCard(props: Readonly<{ item: SubscriptionRow } & RowHandlers>) {
  const { item, checked, inlineAction, reason, pending, onToggle, onOpenInline, onReason, onCancel, onSubmit } = props;
  const visible = inlineAction?.id === item.entitlement.id;
  return <article className="rounded-xl border bg-card p-3 shadow-sm"><div className="flex items-start gap-3"><Checkbox checked={checked} onCheckedChange={() => onToggle(item.entitlement.id)} className="mt-1" /><div className="min-w-0 flex-1 space-y-3"><div><div className="truncate font-medium">{item.product?.title ?? item.entitlement.featureKey}</div><div className="truncate text-xs text-muted-foreground">{item.user?.email ?? item.entitlement.userId}</div></div><div className="grid grid-cols-2 gap-2 text-xs"><Info label="Статус" value={statusLabel(item.entitlement.status)} /><Info label="Продление" value={renewalLabel(item)} /><Info label="Период" value={priceLabel(item)} /><Info label="Доступ" value={`${formatDate(item.entitlement.startsAt)} — ${formatDate(item.entitlement.endsAt)}`} /><Info label="Платёж" value={item.payment?.providerPaymentId ?? "—"} /></div><Actions item={item} onOpenInline={onOpenInline} /><InlineReason visible={visible} reason={reason} pending={pending} onReason={onReason} onSubmit={onSubmit} onCancel={onCancel} /></div></div></article>;
}

function Info({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div className="min-w-0"><div className="text-muted-foreground">{label}</div><div className="truncate">{value}</div></div>;
}

function TableRow(props: Readonly<{ item: SubscriptionRow } & RowHandlers>) {
  const { item, checked, inlineAction, reason, pending, onToggle, onOpenInline, onReason, onCancel, onSubmit } = props;
  const visible = inlineAction?.id === item.entitlement.id;
  return <><tr className="border-t align-top"><td className="p-2"><Checkbox checked={checked} onCheckedChange={() => onToggle(item.entitlement.id)} /></td><td className="p-2"><div>{item.user?.username ?? "—"}</div><div className="text-xs text-muted-foreground">{item.user?.email ?? item.entitlement.userId}</div></td><td className="p-2"><div>{item.product?.title ?? item.entitlement.featureKey}</div><div className="text-xs text-muted-foreground">{item.product?.type ?? item.entitlement.featureKey}</div></td><td className="p-2">{priceLabel(item)}</td><td className="p-2"><div>{statusLabel(item.entitlement.status)}</div><div className="text-xs text-muted-foreground">{renewalLabel(item)}</div><div className="text-xs text-muted-foreground">{formatDate(item.entitlement.startsAt)} — {formatDate(item.entitlement.endsAt)}</div></td><td className="p-2"><div>{item.payment?.status ?? "—"}</div><div className="text-xs text-muted-foreground">{item.payment?.providerPaymentId ?? "—"}</div>{item.payment?.fiscalReceiptUrl && <a className="text-xs underline" href={item.payment.fiscalReceiptUrl}>чек</a>}</td><td className="p-2"><Actions item={item} onOpenInline={onOpenInline} /></td></tr>{visible && <tr className="border-t"><td /><td className="p-3" colSpan={6}><InlineReason visible reason={reason} pending={pending} onReason={onReason} onSubmit={onSubmit} onCancel={onCancel} /></td></tr>}</>;
}
