import { Router, Request, Response } from 'express';
import { repositories, storage } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

const router = Router();

/**
 * POST /api/questions
 * Задать вопрос к сессии
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { sessionId, question } = req.body;

    if (!sessionId || !question) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, question',
      });
    }

    if (question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Question cannot be empty',
      });
    }

    if (question.length > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Question is too long (max 1000 characters)',
      });
    }

    // Проверяем, что сессия существует
    const session = await storage.readingSessions.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot ask a question in a non-active session',
      });
    }

    // Проверяем, что пользователь является членом клуба
    const membership = await storage.getUserClubMembership(session.clubId, userId);
    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this club',
      });
    }

    // Добавляем вопрос
    const createdQuestion = await repositories.sessionQuestions.askQuestion({
      userId,
      sessionId,
      question: question.trim(),
    });

    res.json({
      success: true,
      question: createdQuestion,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error asking question: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to ask question',
    });
  }
});

/**
 * GET /api/questions/session/:sessionId
 * Получить вопросы сессии
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { includeAnswered } = req.query;

    const questions = await repositories.sessionQuestions.getSessionQuestions(
      sessionId,
      includeAnswered === 'true'
    );

    res.json({
      success: true,
      questions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting session questions: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get session questions',
    });
  }
});

/**
 * GET /api/questions/session/:sessionId/unanswered
 * Получить неотвеченные вопросы сессии
 */
router.get('/session/:sessionId/unanswered', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const questions = await repositories.sessionQuestions.getSessionQuestions(sessionId, false);

    // Подсчитываем неотвеченные
    const count = await repositories.sessionQuestions.countUnansweredQuestions(sessionId);

    res.json({
      success: true,
      questions,
      count,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting unanswered questions: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get unanswered questions',
    });
  }
});

/**
 * GET /api/questions/:questionId
 * Получить вопрос по ID
 */
router.get('/:questionId', async (req: Request, res: Response) => {
  try {
    const { questionId } = req.params;

    const question = await repositories.sessionQuestions.getQuestion(questionId);

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found',
      });
    }

    res.json({
      success: true,
      question,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting question: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get question',
    });
  }
});

/**
 * PUT /api/questions/:questionId/answer
 * Ответить на вопрос (только для чтеца)
 */
router.put('/:questionId/answer', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { questionId } = req.params;
    const { answer } = req.body;

    if (!answer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: answer',
      });
    }

    if (answer.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Answer cannot be empty',
      });
    }

    if (answer.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'Answer is too long (max 2000 characters)',
      });
    }

    // Получаем вопрос
    const question = await repositories.sessionQuestions.getQuestion(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found',
      });
    }

    // Проверяем, что пользователь является чтецом (создателем сессии)
    const session = await storage.readingSessions.getSession(question.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the session creator (reader) can answer questions',
      });
    }

    // Отвечаем на вопрос
    const updatedQuestion = await repositories.sessionQuestions.answerQuestion(
      questionId,
      answer.trim()
    );

    res.json({
      success: true,
      question: updatedQuestion,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error answering question: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to answer question',
    });
  }
});

/**
 * GET /api/questions/user/:userId
 * Получить вопросы пользователя
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Проверяем, что запрашивающий пользователь имеет доступ
    const currentUserId = req.user?.id;
    if (currentUserId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own questions',
      });
    }

    const questions = await repositories.sessionQuestions.getUserQuestions(userId);

    res.json({
      success: true,
      questions,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting user questions: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get user questions',
    });
  }
});

/**
 * DELETE /api/questions/:questionId
 * Удалить вопрос
 */
router.delete('/:questionId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { questionId } = req.params;

    // Получаем вопрос для проверки владельца
    const question = await repositories.sessionQuestions.getQuestion(questionId);
    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found',
      });
    }

    // Проверяем, что пользователь является автором вопроса или чтецом
    const session = await storage.readingSessions.getSession(question.sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (question.userId !== userId && session.userId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own questions',
      });
    }

    // Удаляем вопрос
    await repositories.sessionQuestions.deleteQuestion(questionId);

    res.json({
      success: true,
      message: 'Question deleted successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error deleting question: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to delete question',
    });
  }
});

/**
 * GET /api/questions/session/:sessionId/stats
 * Получить статистику вопросов сессии
 */
router.get('/session/:sessionId/stats', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const questions = await repositories.sessionQuestions.getSessionQuestions(sessionId, true);
    const unansweredCount = await repositories.sessionQuestions.countUnansweredQuestions(sessionId);

    const stats = {
      total: questions.length,
      answered: questions.filter(q => q.isAnswered).length,
      unanswered: unansweredCount,
      answeredRate: questions.length > 0
        ? Math.round((questions.filter(q => q.isAnswered).length / questions.length) * 100)
        : 0,
    };

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting question stats: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get question stats',
    });
  }
});

export default router;
