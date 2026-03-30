export const STATIC_IMAGE_TARGET_DIRS = [
  "attached_assets/generated_images",
  "client/public",
];

export const STATIC_IMAGE_SOURCE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);
export const STATIC_IMAGE_MANIFEST_PATH = "script/static-image-manifest.json";
export const STATIC_IMAGE_WEBP_MIN_BYTES = 40 * 1024;
export const STATIC_IMAGE_AVIF_MIN_BYTES = 200 * 1024;
export const STATIC_IMAGE_MIN_WIDTH_FOR_AVIF = 800;
export const STATIC_IMAGE_MIN_SAVINGS_RATIO = 0.08;
export const STATIC_IMAGE_WEBP_OPTIONS = { quality: 82, effort: 4 } as const;
export const STATIC_IMAGE_AVIF_OPTIONS = { quality: 58, effort: 6 } as const;
