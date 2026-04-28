import { Router } from 'express';
import { jwtAuth } from './jwt-middleware.js';
import { genreService } from './services/genre-service.js';

const router = Router();

router.get('/catalog', jwtAuth, async (_req, res) => {
  const genres = await genreService.getActiveGenres();
  res.json(genres);
});

export default router;

