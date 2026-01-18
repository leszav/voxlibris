import { Router } from 'express';
import { storage } from './storage.js';
import { insertBookAccessLogSchema } from '../shared/schema.js';
import { z } from 'zod';
import { jwtAuth } from './jwt-middleware.js';

const router = Router();

// Log Book Access
router.post('/books/:bookId/access', jwtAuth, async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        const { bookId } = req.params;
        const { bookType, action, deviceType, sessionDurationMinutes, ipHash } = req.body;

        // Validate input
        const logData = insertBookAccessLogSchema.parse({
            bookId,
            bookType,
            action,
            deviceType,
            sessionDurationMinutes,
            ipHash,
        });

        await storage.logBookAccess({
            ...logData,
            userId: req.user.id,
        });

        res.json({ success: true });
    } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({ error: error.issues });
            }
        console.error('Access log error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
