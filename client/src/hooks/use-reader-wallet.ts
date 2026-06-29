import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';

export interface ReaderWalletBalance {
  availableKopecks: number;
  pendingKopecks: number;
  withdrawnKopecks: number;
  totalEarnedKopecks: number;
}

export interface ReaderLedgerEntry {
  id: string;
  paymentId: string;
  orderId: string;
  clubId: string | null;
  clubTitle: string | null;
  entryType: string;
  amountKopecks: number;
  status: string;
  createdAt: string;
}

export interface ReaderWalletData {
  balance: ReaderWalletBalance;
  history: ReaderLedgerEntry[];
}

export interface WithdrawalRequest {
  id: string;
  amountKopecks: number;
  status: 'demo_approved';
  createdAt: string;
  processedAt: string;
}

export interface WithdrawalResponse {
  success: boolean;
  withdrawal: WithdrawalRequest;
  message: string;
}

export function useReaderWallet() {
  return useQuery<ReaderWalletData>({
    queryKey: ['reader', 'wallet'],
    queryFn: () => apiRequest<ReaderWalletData>('/api/v1/reader/wallet'),
    staleTime: 1000 * 30, // 30 секунд
  });
}

export function useReaderWithdraw() {
  const queryClient = useQueryClient();

  return useMutation<WithdrawalResponse, Error>({
    mutationFn: () =>
      apiRequest<WithdrawalResponse>('/api/v1/reader/wallet/withdraw', {
        method: 'POST',
      }),
    onSuccess: () => {
      // Обновить данные кошелька после успешного вывода
      void queryClient.invalidateQueries({ queryKey: ['reader', 'wallet'] });
    },
  });
}
