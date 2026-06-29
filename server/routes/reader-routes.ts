import { Router } from 'express';
import { jwtAuth } from '../jwt-middleware.js';
import { ReaderWalletService } from '../services/reader-wallet-service.js';

const router = Router();
const walletService = new ReaderWalletService();

/**
 * GET /api/v1/reader/status
 * Проверить, является ли пользователь владельцем reader-led клуба
 */
router.get('/status', jwtAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const isReader = await walletService.isReaderClubOwner(userId);
    
    if (!isReader) {
      res.json({ isReaderClubOwner: false });
      return;
    }

    // Получить информацию о клубе чтеца
    const clubInfo = await walletService.getReaderClubInfo(userId);
    
    res.json({
      isReaderClubOwner: true,
      clubId: clubInfo?.id,
      clubTitle: clubInfo?.title,
    });
  } catch (error) {
    console.error('GET /status error:', error);
    res.status(500).json({ error: 'Не удалось проверить статус чтеца' });
  }
});

/**
 * GET /api/v1/reader/wallet
 * Получить баланс и историю начислений текущего чтеца
 */
router.get('/wallet', jwtAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Проверка, что пользователь — владелец reader-led клуба
    const isReader = await walletService.isReaderClubOwner(userId);
    if (!isReader) {
      res.status(403).json({ error: 'Доступ только для чтецов с активным reader-led клубом' });
      return;
    }

    const balance = await walletService.getBalance(userId);
    const history = await walletService.getHistory(userId, 50, 0);

    res.json({
      balance,
      history,
    });
  } catch (error) {
    console.error('GET /wallet error:', error);
    res.status(500).json({ error: 'Не удалось получить данные кошелька' });
  }
});

/**
 * POST /api/v1/reader/wallet/withdraw
 * Создать демо-запрос на вывод средств
 * Помечает все available earnings как withdrawn
 */
router.post('/wallet/withdraw', jwtAuth, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Проверка, что пользователь — владелец reader-led клуба
    const isReader = await walletService.isReaderClubOwner(userId);
    if (!isReader) {
      res.status(403).json({ error: 'Доступ только для чтецов с активным reader-led клубом' });
      return;
    }

    const withdrawal = await walletService.createDemoWithdrawal(userId);

    res.json({
      success: true,
      withdrawal,
      message: 'Демо-вывод успешно создан. В реальном режиме здесь будет интеграция с банком.',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Нет доступных средств для вывода') {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('POST /wallet/withdraw error:', error);
    res.status(500).json({ error: 'Не удалось создать запрос на вывод' });
  }
});

export default router;
