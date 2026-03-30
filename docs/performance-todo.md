# Performance TODO

## Phase 1

- Split routes into lazy-loaded chunks so the landing page does not ship the entire app on first visit.
- Serve hero and other large static images in modern formats (`webp`/`avif`) with `png/jpg` fallback where needed.
- Generate compressed static assets (`.br`/`.gz`) during build and serve them with `Content-Encoding`.
- Fix cache headers for built assets: hashed files under `/assets/*` should be `immutable`.
- Defer non-critical startup work on public pages: Yandex Metrika, guest session bootstrap, anonymous auth bootstrap.

## Phase 2

- Review the homepage payload of `/api/clubs/catalog`; reduce fields or move the block below the fold if possible.
- Audit Google Fonts usage and move to self-hosted critical subsets.
- Check whether guest banner should be route-scoped instead of global in the main layout.
- Verify production reverse proxy/CDN also preserves `Cache-Control`, `Vary`, and precompressed asset delivery.

## Image policy

- User-uploaded covers, avatars, and background images must continue to pass through `sharp` and be stored only in optimized web formats.
- Existing repository images larger than the configured threshold should get generated `webp`/`avif` companions through the static optimization script.
- New static images should be added as source assets, optimized once via `pnpm images:optimize:static`, and then validated by `pnpm images:check:static` during builds.
