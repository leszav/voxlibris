import { useState } from 'react';
import { Wallet, TrendingUp, Clock, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { useReaderWallet, useReaderWithdraw } from '../hooks/use-reader-wallet';
import { MainLayout } from '../components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Skeleton } from '../components/ui/skeleton';

function formatRubles(kopecks: number): string {
  return (kopecks / 100).toFixed(2) + ' ₽';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'available':
      return <Badge variant="default">Доступно</Badge>;
    case 'pending':
      return <Badge variant="secondary">В обработке</Badge>;
    case 'withdrawn':
      return <Badge variant="outline">Выведено (демо)</Badge>;
    case 'paid':
      return <Badge variant="outline">Выплачено</Badge>;
    case 'void':
      return <Badge variant="destructive">Отменено</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function ReaderWalletPage() {
  const { data, isLoading, error } = useReaderWallet();
  const withdrawMutation = useReaderWithdraw();
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  const handleWithdrawClick = () => {
    if (data && data.balance.availableKopecks > 0) {
      setWithdrawDialogOpen(true);
    }
  };

  const handleConfirmWithdraw = async () => {
    try {
      await withdrawMutation.mutateAsync();
      setWithdrawDialogOpen(false);
    } catch {
      // Ошибка уже обработана в mutation
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto max-w-6xl px-4 py-8 sm:px-6 md:px-12">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Wallet className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Кошелёк чтеца</h1>
          </div>
          <p className="text-muted-foreground">
            Управление балансом и вывод средств из ваших reader-led клубов
          </p>
          <Alert className="mt-4 border-amber-500/50 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 dark:text-amber-100">
              <strong>Демо-режим:</strong> функция вывода средств работает в демонстрационном режиме. Для
              реальных выплат требуется интеграция с банковской системой.
            </AlertDescription>
          </Alert>
        </header>

        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error && error.message.includes('403')
                ? 'Доступ только для чтецов с активным reader-led клубом'
                : 'Не удалось загрузить данные кошелька'}
            </AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-10 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <Skeleton className="h-64 w-full" />
          </div>
        ) : data ? (
          <>
            <div className="grid gap-4 mb-6 md:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Доступно к выводу</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {formatRubles(data.balance.availableKopecks)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">В обработке</CardTitle>
                  <Clock className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {formatRubles(data.balance.pendingKopecks)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Выведено</CardTitle>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-muted-foreground">
                    {formatRubles(data.balance.withdrawnKopecks)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  Всего заработано: <span className="font-semibold">{formatRubles(data.balance.totalEarnedKopecks)}</span>
                </p>
              </div>
              <Button
                onClick={handleWithdrawClick}
                disabled={data.balance.availableKopecks === 0 || withdrawMutation.isPending}
              >
                <Download className="mr-2 h-4 w-4" />
                Вывести средства (демо)
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>История начислений</CardTitle>
                <CardDescription>
                  Все начисления от подписчиков ваших reader-led клубов
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.history.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>История начислений пуста</p>
                    <p className="text-sm mt-1">Начисления появятся после первых оплат подписчиков</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b">
                        <tr className="text-left">
                          <th className="pb-2 font-medium text-muted-foreground">Дата</th>
                          <th className="pb-2 font-medium text-muted-foreground">Клуб</th>
                          <th className="pb-2 font-medium text-muted-foreground">Сумма</th>
                          <th className="pb-2 font-medium text-muted-foreground">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.map((entry) => (
                          <tr key={entry.id} className="border-b last:border-0">
                            <td className="py-3 text-muted-foreground">{formatDate(entry.createdAt)}</td>
                            <td className="py-3">{entry.clubTitle || '—'}</td>
                            <td className="py-3 font-medium">{formatRubles(entry.amountKopecks)}</td>
                            <td className="py-3">{getStatusBadge(entry.status)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Вывод средств (демо-режим)</DialogTitle>
            <DialogDescription>
              Вы собираетесь вывести {data ? formatRubles(data.balance.availableKopecks) : '0 ₽'} из
              вашего кошелька.
            </DialogDescription>
          </DialogHeader>

          <Alert className="border-amber-500/50 bg-amber-500/10">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-sm text-amber-900 dark:text-amber-100">
              Это демо-режим для демонстрации инвесторам. Средства будут помечены как «выведено (демо)», но
              реальная банковская транзакция не выполняется. Для боевого режима потребуется интеграция с
              платёжным провайдером.
            </AlertDescription>
          </Alert>

          {withdrawMutation.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {withdrawMutation.error instanceof Error
                  ? withdrawMutation.error.message
                  : 'Не удалось выполнить вывод'}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setWithdrawDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleConfirmWithdraw} disabled={withdrawMutation.isPending}>
              {withdrawMutation.isPending ? 'Обработка...' : 'Подтвердить вывод'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
