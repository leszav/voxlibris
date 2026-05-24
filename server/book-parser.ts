import * as path from 'node:path';
import JSZip from 'jszip';
import * as xml2js from 'xml2js';
import * as mime from 'mime-types';
import * as crypto from 'node:crypto';
import { JSDOM } from 'jsdom';
import { logger } from './lib/logger.js';

type XmlAttributes = Record<string, string>;
type XmlElement = {
  $?: XmlAttributes;
  [key: string]: unknown;
};

const firstItem = <T>(value: unknown): T | undefined => (Array.isArray(value) ? (value[0] as T | undefined) : undefined);
const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const getXmlAttribute = (element: XmlElement | undefined, attributeName: string): string | undefined => {
  const attributes = element?.$;
  if (!attributes) return undefined;

  if (attributes[attributeName]) return attributes[attributeName];

  const namespacedAttribute = Object.entries(attributes).find(([key]) => key === attributeName || key.endsWith(`:${attributeName}`));
  return namespacedAttribute?.[1];
};
const getXmlTextNodeValue = (value: unknown): string | undefined => {
  if (typeof value !== 'object' || value === null || !('_' in value)) return undefined;

  const text = value._;
  return typeof text === 'string' ? text : undefined;
};

const STRUCTURAL_FB2_SECTION_TITLES = [
  'пролог',
  'эпилог',
] as const;

const STRUCTURAL_FB2_SECTION_PREFIXES = [
  'часть',
  'глава',
  'книга',
  'том',
  'раздел',
  'акт',
] as const;

const STRUCTURAL_FB2_SECTION_ORDINALS = [
  'первая',
  'вторая',
  'третья',
  'четвертая',
  'четвёртая',
  'пятая',
  'шестая',
  'седьмая',
  'восьмая',
  'девятая',
  'десятая',
  'одиннадцатая',
  'двенадцатая',
  'последняя',
] as const;

const isArabicOrRomanSectionMarker = (value: string): boolean => (
  /^\d+[.)]?$/.test(value) || /^[ivxlcdm]+[.)]?$/i.test(value)
);

async function withParseTimeout<T>(promise: Promise<T>, label: string, timeoutMs = BOOK_PARSE_TIMEOUT_MS): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function parsePositiveIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_BOOK_PARSE_BYTES = parsePositiveIntEnv(process.env.MAX_BOOK_PARSE_MB, 50) * 1024 * 1024;
const BOOK_PARSE_TIMEOUT_MS = parsePositiveIntEnv(process.env.BOOK_PARSE_TIMEOUT_MS, 15000);
const MAX_EPUB_ENTRIES = parsePositiveIntEnv(process.env.MAX_EPUB_ENTRY_COUNT, 3000);
const MAX_EPUB_UNCOMPRESSED_BYTES = parsePositiveIntEnv(process.env.MAX_EPUB_UNCOMPRESSED_MB, 200) * 1024 * 1024;
const MAX_EPUB_TEXT_ENTRY_BYTES = parsePositiveIntEnv(process.env.MAX_EPUB_TEXT_ENTRY_MB, 8) * 1024 * 1024;
const MAX_EPUB_COVER_BYTES = parsePositiveIntEnv(process.env.MAX_EPUB_COVER_MB, 10) * 1024 * 1024;
const MAX_BOOK_CHAPTERS = parsePositiveIntEnv(
  process.env.MAX_BOOK_CHAPTERS || process.env.MAX_EPUB_CHAPTERS,
  1500,
);
const MAX_FB2_XML_BYTES = parsePositiveIntEnv(process.env.MAX_FB2_XML_MB, 20) * 1024 * 1024;
const MAX_FB2_COVER_BYTES = parsePositiveIntEnv(process.env.MAX_FB2_COVER_MB, 10) * 1024 * 1024;

export interface BookMetadata {
  title: string;
  author: string;
  description?: string;
  isbn?: string;
  genre?: string;
  genres?: string[];
  language?: string;
  publisher?: string;
  publishDate?: string;
  coverImageData?: Buffer;
  coverImageType?: string;
  totalChapters: number;
  contentHash?: string;
}

export interface BookChapter {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface ParsedBook {
  metadata: BookMetadata;
  chapters: BookChapter[];
  originalFilename: string;
  fileType: 'epub' | 'fb2';
}

export abstract class BaseBookParser {
  abstract parseBook(fileBuffer: Buffer, filename: string): Promise<ParsedBook>;

  protected assertInputSize(fileBuffer: Buffer): void {
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      throw new Error('Empty file payload');
    }

    if (fileBuffer.length > MAX_BOOK_PARSE_BYTES) {
      throw new Error(`File exceeds parser limit of ${Math.round(MAX_BOOK_PARSE_BYTES / 1024 / 1024)} MB`);
    }
  }

  protected async withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = BOOK_PARSE_TIMEOUT_MS): Promise<T> {
    return withParseTimeout(promise, label, timeoutMs);
  }

  protected cleanText(text: string): string {
    return text
      .replaceAll(/<[^>]*>/g, '') // Remove HTML tags
      .replaceAll(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  protected countWords(text: string): number {
    return this.cleanText(text).split(' ').filter(word => word.length > 0).length;
  }

  protected extractTextFromHtml(html: string): string {
    // Simple HTML to text conversion with proper encoding support
    return html
      .replaceAll(/<br\s*\/?>/gi, '\n')
      .replaceAll(/<\/p>/gi, '\n\n')
      .replaceAll(/<[^>]*>/g, '')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&laquo;', '«')
      .replaceAll('&raquo;', '»')
      .replaceAll('&hellip;', '...')
      .replaceAll('&mdash;', '—')
      .replaceAll('&ndash;', '–')
      .replaceAll('&ldquo;', '"')
      .replaceAll('&rdquo;', '"')
      .replaceAll('&lsquo;', "'")
      .replaceAll('&rsquo;', "'")
      .trim();
  }

  protected calculateContentHash(fileBuffer: Buffer): string {
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  protected calculateTextContentHash(chapters: BookChapter[]): string {
    // Create a normalized text representation for content-based hashing
    const normalizedContent = chapters
      .map(chapter => `${chapter.title}|${this.cleanText(chapter.content)}`)
      .join('\n---\n');

    return crypto.createHash('sha256').update(normalizedContent, 'utf8').digest('hex');
  }
}

export class EPUBParser extends BaseBookParser {
  async parseBook(fileBuffer: Buffer, filename: string): Promise<ParsedBook> {
    try {
      this.assertInputSize(fileBuffer);

      const zip = await this.withTimeout(
        JSZip.loadAsync(fileBuffer),
        'EPUB archive loading',
      );
      this.ensureArchiveSafety(zip);

      // Найти OPF файл (содержит метаданные)
      const opfFile = await this.findOpfFile(zip);
      if (!opfFile) {
        throw new Error('OPF file not found in EPUB');
      }

      const normalizedOpfPath = this.normalizeZipPath(opfFile);
      const opfFileObject = zip.file(normalizedOpfPath);
      if (!opfFileObject) {
        throw new Error('OPF file object not found');
      }

      this.assertZipEntrySize(opfFileObject, MAX_EPUB_TEXT_ENTRY_BYTES, 'OPF file');
      const opfContent = await this.withTimeout(
        opfFileObject.async('string'),
        'Read OPF file',
      );
      if (!opfContent) {
        throw new Error('Failed to read OPF content');
      }

      const parser = new xml2js.Parser();
      const opfData = await this.withTimeout(
        parser.parseStringPromise(opfContent),
        'Parse OPF XML',
      );

      const opfDir = this.normalizeOpfDir(normalizedOpfPath);

      // Извлечь метаданные
      const metadata = await this.extractMetadata(opfData, zip, opfDir);

      // Извлечь главы
      const chapters = await this.extractChapters(opfData, zip, opfDir, metadata.title);

      // Вычислить хеш содержимого
      const contentHash = this.calculateTextContentHash(chapters);

      return {
        metadata: {
          ...metadata,
          totalChapters: chapters.length,
          contentHash,
        },
        chapters,
        originalFilename: filename,
        fileType: 'epub',
      };
    } catch (error) {
      console.error('Error parsing EPUB:', error);
      throw new Error(`Failed to parse EPUB: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private getZipEntryUncompressedSize(entry: unknown): number | null {
    const size = (entry as { _data?: { uncompressedSize?: unknown } })?._data?.uncompressedSize;
    return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null;
  }

  private assertZipEntrySize(entry: unknown, maxBytes: number, entryLabel: string): void {
    const declaredSize = this.getZipEntryUncompressedSize(entry);
    if (declaredSize !== null && declaredSize > maxBytes) {
      throw new Error(`${entryLabel} exceeds ${Math.round(maxBytes / 1024 / 1024)} MB limit`);
    }
  }

  private ensureArchiveSafety(zip: JSZip): void {
    const entries = Object.entries(zip.files);
    const fileEntries = entries.filter(([, entry]) => !entry.dir);

    if (fileEntries.length === 0) {
      throw new Error('EPUB archive has no files');
    }

    if (fileEntries.length > MAX_EPUB_ENTRIES) {
      throw new Error(`EPUB archive has too many files: ${fileEntries.length}`);
    }

    let totalUncompressedBytes = 0;

    for (const [entryName, entry] of fileEntries) {
      const normalizedName = entryName.replaceAll('\\', '/');
      if (normalizedName.startsWith('/') || normalizedName.includes('../')) {
        throw new Error(`Unsafe EPUB entry path: ${entryName}`);
      }

      const size = this.getZipEntryUncompressedSize(entry);
      if (size !== null) {
        totalUncompressedBytes += size;
        if (totalUncompressedBytes > MAX_EPUB_UNCOMPRESSED_BYTES) {
          throw new Error(`EPUB archive exceeds max uncompressed size of ${Math.round(MAX_EPUB_UNCOMPRESSED_BYTES / 1024 / 1024)} MB`);
        }
      }
    }
  }

  private async findOpfFile(zip: JSZip): Promise<string | null> {
    // Читаем META-INF/container.xml для поиска OPF файла
    const containerContent = await this.readZipText(zip, 'META-INF/container.xml', MAX_EPUB_TEXT_ENTRY_BYTES);
    if (!containerContent) return null;

    try {
      const parser = new xml2js.Parser();
      const containerData = await this.withTimeout(
        parser.parseStringPromise(containerContent),
        'Parse EPUB container.xml',
      );

      const rootfiles = containerData?.container?.rootfiles?.[0]?.rootfile;
      if (rootfiles && rootfiles.length > 0) {
        return rootfiles[0].$?.['full-path'];
      }
    } catch (error) {
      console.error('Error parsing container.xml:', error);
    }

    // Fallback: поиск .opf файлов
    for (const filename of Object.keys(zip.files)) {
      if (filename.endsWith('.opf')) {
        return filename;
      }
    }

    return null;
  }

  private async extractMetadata(
    opfData: XmlElement,
    zip: JSZip,
    opfDir: string
  ): Promise<Omit<BookMetadata, 'totalChapters'>> {
    const packageNode = opfData?.package as XmlElement | undefined;
    const metadata = firstItem<XmlElement>(packageNode?.metadata);
    if (!metadata) {
      return {
        title: 'Unknown Title',
        author: 'Unknown Author',
      };
    }

    // Извлечь основные метаданные
    const title = this.extractMetaValue(metadata['dc:title'] ?? metadata.title);
    const author = this.extractMetaValue(metadata['dc:creator'] ?? metadata.creator);
    const description = this.extractMetaValue(metadata['dc:description'] ?? metadata.description);
    const isbn = this.extractMetaValue(metadata['dc:identifier'] ?? metadata.identifier);
    const genres = this.extractMetaValues(metadata['dc:subject'] ?? metadata.subject);
    const language = this.extractMetaValue(metadata['dc:language'] ?? metadata.language);
    const publisher = this.extractMetaValue(metadata['dc:publisher'] ?? metadata.publisher);
    const publishDate = this.extractMetaValue(metadata['dc:date'] ?? metadata.date);

    // Попытаться найти обложку
    let coverImageData: Buffer | undefined;
    let coverImageType: string | undefined;

    try {
      const coverInfo = await this.findCoverImage(opfData, zip, opfDir);
      if (coverInfo) {
        coverImageData = coverInfo.data;
        coverImageType = coverInfo.type;
      }
    } catch (error) {
      logger.warn({ error }, 'Could not extract cover image');
    }

    return {
      title: title || 'Unknown Title',
      author: author || 'Unknown Author',
      description,
      isbn,
      genre: genres[0],
      genres,
      language,
      publisher,
      publishDate,
      coverImageData,
      coverImageType,
    };
  }

  private extractMetaValue(metaValue: unknown): string | undefined {
    if (!metaValue) return undefined;

    if (typeof metaValue === 'string') return metaValue;

    if (Array.isArray(metaValue)) {
      const firstMetaValue = metaValue[0];
      return typeof firstMetaValue === 'string'
        ? firstMetaValue
        : getXmlTextNodeValue(firstMetaValue);
    }

    return getXmlTextNodeValue(metaValue);
  }

  private extractMetaValues(metaValue: unknown): string[] {
    if (!metaValue) return [];

    const source = Array.isArray(metaValue) ? metaValue : [metaValue];
    const values = source
      .map((item) => typeof item === 'string' ? item : getXmlTextNodeValue(item))
      .map(value => value?.trim())
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(values));
  }

  private async readManifestItemBuffer(
    zip: JSZip,
    opfDir: string,
    href: string,
    mediaType: string | undefined,
  ): Promise<{ data: Buffer; type: string } | null> {
    const imagePath = this.resolveZipPath(opfDir, href.split('#')[0]);
    const imageFile = zip.file(imagePath);
    if (!imageFile) return null;

    this.assertZipEntrySize(imageFile, MAX_EPUB_COVER_BYTES, `EPUB cover image: ${imagePath}`);
    const imageData = await this.withTimeout(
      imageFile.async('nodebuffer'),
      `Read EPUB cover image: ${imagePath}`,
    );

    return {
      data: imageData,
      type: mediaType || mime.lookup(href) || 'image/jpeg',
    };
  }

  private async findCoverImage(
    opfData: XmlElement,
    zip: JSZip,
    opfDir: string
  ): Promise<{ data: Buffer; type: string } | null> {
    const packageNode = opfData?.package as XmlElement | undefined;
    const manifestRoot = firstItem<XmlElement>(packageNode?.manifest);
    const manifest = asArray<XmlElement>(manifestRoot?.item);

    // Искать элемент с id="cover" или media-type содержащий "image"
    for (const item of manifest) {
      const id = item.$?.id;
      const href = item.$?.href;
      const mediaType = item.$?.['media-type'];

      if ((id === 'cover' || id === 'cover-image' || mediaType?.startsWith('image/')) && href) {
        try {
          const cover = await this.readManifestItemBuffer(zip, opfDir, href, mediaType);
          if (cover) return cover;
        } catch (error) {
          logger.warn({ error }, 'Error reading cover image');
        }
      }
    }

    return null;
  }

  private async extractChapters(
    opfData: XmlElement,
    zip: JSZip,
    opfDir: string,
    bookTitle?: string
  ): Promise<BookChapter[]> {
    const packageNode = opfData?.package as XmlElement | undefined;
    const spineRoot = firstItem<XmlElement>(packageNode?.spine);
    const manifestRoot = firstItem<XmlElement>(packageNode?.manifest);
    const spine = asArray<XmlElement>(spineRoot?.itemref);
    const manifest = asArray<XmlElement>(manifestRoot?.item);

    const manifestMap = new Map(
      manifest
        .map((item) => [item.$?.id, item] as const)
        .filter((entry): entry is [string, XmlElement] => Boolean(entry[0])),
    );

    const tocMap = await this.extractTocMap(opfData, zip, opfDir);
    const chapters: BookChapter[] = [];

    for (let i = 0; i < spine.length; i++) {
      if (chapters.length >= MAX_BOOK_CHAPTERS) {
        throw new Error(`EPUB exceeds chapter limit of ${MAX_BOOK_CHAPTERS}`);
      }

      const itemRef = spine[i];
      const idref = itemRef.$?.idref;
      const linear = itemRef.$?.linear;

      if (!idref) continue;
      if (linear && String(linear).toLowerCase() === 'no') continue;

      const href = this.getSpineItemHref(manifestMap, idref);
      if (!href) continue;

      try {
        const chapter = await this.readEpubChapter(zip, opfDir, href, tocMap, chapters.length + 1, bookTitle);
        if (!chapter) continue;
        chapters.push(chapter);
      } catch (error) {
        console.warn(`Error processing chapter ${i + 1}:`, error);
      }
    }

    return chapters;
  }

  private async readEpubChapter(
    zip: JSZip,
    opfDir: string,
    href: string,
    tocMap: Map<string, string>,
    chapterNumber: number,
    bookTitle?: string,
  ): Promise<BookChapter | null> {
    const filePath = this.resolveZipPath(opfDir, href.split('#')[0]);
    const chapterFile = zip.file(filePath);

    if (!chapterFile) {
      console.warn(`Chapter file not found: ${filePath}`);
      return null;
    }

    this.assertZipEntrySize(chapterFile, MAX_EPUB_TEXT_ENTRY_BYTES, `EPUB chapter file: ${filePath}`);
    const chapterContent = await this.withTimeout(
      chapterFile.async('string'),
      `Read EPUB chapter file: ${filePath}`,
    );
    const { html, text, title } = this.extractReadableHtmlFromEpub(chapterContent);
    const textContent = text || this.extractTextFromHtml(chapterContent);
    const tocTitle = tocMap.get(filePath);
    const chapterTitle = this.chooseChapterTitle(title, tocTitle, chapterNumber, bookTitle);

    if (this.isNonContentChapter(chapterTitle, textContent, html, bookTitle)) {
      return null;
    }

    return {
      chapterNumber,
      title: chapterTitle,
      content: html || textContent,
      wordCount: this.countWords(textContent),
    };
  }

  private normalizeZipPath(zipPath: string): string {
    return zipPath.replace(/^[\\/]+/, '');
  }

  private normalizeOpfDir(opfPath: string): string {
    const dir = path.posix.dirname(this.normalizeZipPath(opfPath));
    return dir === '.' ? '' : dir;
  }

  private resolveZipPath(opfDir: string, href: string): string {
    const stripped = href.replace(/^[\\/]+/, '');
    let decoded = stripped;
    try {
      decoded = decodeURIComponent(stripped);
    } catch {
      decoded = stripped;
    }
    return opfDir ? path.posix.join(opfDir, decoded) : decoded;
  }

  private extractReadableHtmlFromEpub(htmlContent: string): { html: string; text: string; title?: string } {
    try {
      const dom = new JSDOM(htmlContent);
      const doc = dom.window.document;

      // Удаляем только действительно служебные элементы
      // Оставляем семантические HTML5 теги (section, article, aside, figure, figcaption)
      // Оставляем MathML и SVG (допустимы в EPUB 3)
      const removeSelectors = [
        "script", "style", "header", "footer", "form",
        "iframe", "link", "meta", "button", "input",
        "textarea", "select",
        ".toc", "#toc", "[role='doc-toc']",
        // Удаляем nav только если это явно навигация (TOC)
        "nav[role='navigation']",
        String.raw`nav[epub\:type='toc']`,
        String.raw`nav[epub\:type='landmarks']`,
        // Удаляем pagebreak элементы (служебные)
        String.raw`[epub\:type='pagebreak']`,
        String.raw`span[epub\:type='pagebreak']`,
      ];
      doc.querySelectorAll(removeSelectors.join(",")).forEach(el => el.remove());

      // Сохраняем важные атрибуты epub:type, преобразуя их в data-epub-type для HTML
      doc.querySelectorAll(String.raw`[epub\:type]`).forEach(el => {
        const epubType = el.getAttribute("epub:type");
        if (epubType && el instanceof dom.window.HTMLElement) {
          el.dataset.epubType = epubType;
        }
      });

      const body = doc.body || doc.documentElement;
      if (!body) {
        return { html: "", text: "" };
      }

      const titleEl = doc.querySelector("h1, h2, h3, title");
      const title = titleEl?.textContent?.trim();

      const html = body.innerHTML.trim();
      const text = body.textContent?.trim() || "";

      return { html, text, title };
    } catch (error) {
      console.warn("Failed to extract readable HTML from EPUB:", error);
      return { html: "", text: "" };
    }
  }

  private normalizeTitle(value?: string): string {
    return (value || "")
      .toLowerCase()
      .replaceAll(/\s+/g, " ")
      .trim();
  }

  private chooseChapterTitle(
    htmlTitle: string | undefined,
    tocTitle: string | undefined,
    chapterNumber: number,
    bookTitle?: string
  ): string {
    const normalizedBookTitle = this.normalizeTitle(bookTitle);
    const normalizedHtmlTitle = this.normalizeTitle(htmlTitle);

    if (tocTitle && this.normalizeTitle(tocTitle)) {
      return tocTitle;
    }

    if (htmlTitle && normalizedHtmlTitle && normalizedHtmlTitle !== normalizedBookTitle) {
      return htmlTitle;
    }

    return `Chapter ${chapterNumber}`;
  }

  private isNonContentChapter(
    chapterTitle: string,
    textContent: string,
    htmlContent: string,
    bookTitle?: string
  ): boolean {
    const normalizedTitle = this.normalizeTitle(chapterTitle);
    const normalizedBookTitle = this.normalizeTitle(bookTitle);

    const stopTitles = new Set([
      "cover",
      "annotation",
      "annotaion",
      "annotation.",
      "аннотация",
      "обложка",
      "титульный лист",
      "title",
      "title page",
      "copyright",
      "copyright page",
      "предисловие",
      "от автора",
      "оглавление",
      "contents",
      "table of contents"
    ]);

    const hasImages = /<img\b/i.test(htmlContent);
    const wordCount = this.countWords(textContent);

    if (normalizedTitle && stopTitles.has(normalizedTitle) && wordCount < 120 && !hasImages) {
      return true;
    }

    if (normalizedTitle && normalizedBookTitle && normalizedTitle === normalizedBookTitle && wordCount < 200 && !hasImages) {
      return true;
    }

    if (!wordCount && !hasImages) {
      return true;
    }

    return false;
  }

  private async extractTocMap(opfData: XmlElement, zip: JSZip, opfDir: string): Promise<Map<string, string>> {
    const tocMap = new Map<string, string>();
    const packageNode = opfData?.package as XmlElement | undefined;
    const manifestRoot = firstItem<XmlElement>(packageNode?.manifest);
    const manifest = asArray<XmlElement>(manifestRoot?.item);

    await this.appendNavToc(manifest, zip, opfDir, tocMap);

    // EPUB2 fallback: NCX
    if (tocMap.size === 0) {
      await this.appendNcxToc(manifest, zip, opfDir, tocMap);
    }

    return tocMap;
  }

  private extractTocFromNavHtml(htmlContent: string, opfDir: string, tocMap: Map<string, string>): void {
    try {
      const dom = new JSDOM(htmlContent);
      const doc = dom.window.document;

      const nav = this.findTocNavElement(doc);

      if (!nav) return;

      nav.querySelectorAll("a[href]").forEach((link) => {
        const href = link.getAttribute("href");
        if (!href) return;
        const label = link.textContent?.trim();
        if (!label) return;

        const filePath = this.resolveZipPath(opfDir, href.split('#')[0]);
        if (!tocMap.has(filePath)) {
          tocMap.set(filePath, label);
        }
      });
    } catch (error) {
      console.warn("Failed to extract TOC from nav HTML:", error);
    }
  }

  private extractTocFromNcx(ncxData: XmlElement, opfDir: string, tocMap: Map<string, string>): void {
    const ncxRoot = ncxData?.ncx as XmlElement | undefined;
    const navMap = firstItem<XmlElement>(ncxRoot?.navMap);
    const navPoints = asArray<XmlElement>(navMap?.navPoint);
    if (!Array.isArray(navPoints)) return;

    const walk = (points: XmlElement[]) => {
      for (const point of points) {
        const navLabel = asArray<XmlElement>(point?.navLabel);
        const label = firstItem<XmlElement>(navLabel)?.text;
        const labelText = Array.isArray(label) ? (label[0] as string | undefined)?.trim() : undefined;
        const content = asArray<XmlElement>(point?.content);
        const src = firstItem<XmlElement>(content)?.$?.src;
        if (labelText && src) {
          const filePath = this.resolveZipPath(opfDir, src.split('#')[0]);
          if (!tocMap.has(filePath)) {
            tocMap.set(filePath, labelText);
          }
        }
        const children = point?.navPoint;
        if (Array.isArray(children) && children.length > 0) {
          walk(children as XmlElement[]);
        }
      }
    };

    walk(navPoints);
  }

  private findNavItem(manifest: XmlElement[]): XmlElement | null {
    return manifest.find((item) => String(item.$?.properties || "").toLowerCase().includes("nav")) || null;
  }

  private findNcxItem(manifest: XmlElement[]): XmlElement | null {
    return manifest.find((item) =>
      String(item.$?.['media-type'] || "").toLowerCase().includes("x-dtbncx+xml")
    ) || null;
  }

  private async readZipText(zip: JSZip, filePath: string, maxBytes = MAX_EPUB_TEXT_ENTRY_BYTES): Promise<string | null> {
    const file = zip.file(filePath);
    if (!file) return null;

    this.assertZipEntrySize(file, maxBytes, `EPUB entry: ${filePath}`);

    try {
      return await this.withTimeout(
        file.async("string"),
        `Read EPUB entry: ${filePath}`,
      );
    } catch (error) {
      console.warn("Failed to read EPUB file:", error);
      return null;
    }
  }

  private async appendNavToc(
    manifest: XmlElement[],
    zip: JSZip,
    opfDir: string,
    tocMap: Map<string, string>
  ): Promise<void> {
    const navItem = this.findNavItem(manifest);
    if (!navItem?.$?.href) return;

    const navPath = this.resolveZipPath(opfDir, navItem.$.href.split('#')[0]);
    const navContent = await this.readZipText(zip, navPath);
    if (!navContent) return;

    this.extractTocFromNavHtml(navContent, opfDir, tocMap);
  }

  private async appendNcxToc(
    manifest: XmlElement[],
    zip: JSZip,
    opfDir: string,
    tocMap: Map<string, string>
  ): Promise<void> {
    const ncxItem = this.findNcxItem(manifest);
    if (!ncxItem?.$?.href) return;

    const ncxPath = this.resolveZipPath(opfDir, ncxItem.$.href.split('#')[0]);
    const ncxContent = await this.readZipText(zip, ncxPath);
    if (!ncxContent) return;

    try {
      const parser = new xml2js.Parser();
      const ncxData = await parser.parseStringPromise(ncxContent);
      this.extractTocFromNcx(ncxData, opfDir, tocMap);
    } catch (error) {
      console.warn("Failed to parse EPUB NCX:", error);
    }
  }

  private getSpineItemHref(manifestMap: Map<string, XmlElement>, idref: string): string | null {
    const manifestItem = manifestMap.get(idref);
    if (!manifestItem) return null;

    const href = manifestItem.$?.href;
    if (!href) return null;

    const properties = String(manifestItem.$?.properties || '').toLowerCase();
    if (this.shouldSkipManifestProperties(properties)) return null;

    const mediaType = String(manifestItem.$?.['media-type'] || '').toLowerCase();
    if (mediaType && !mediaType.includes('html') && !mediaType.includes('xhtml')) {
      return null;
    }

    return href;
  }

  private shouldSkipManifestProperties(properties: string): boolean {
    if (!properties) return false;
    return (
      properties.includes('nav') ||
      properties.includes('toc') ||
      properties.includes('cover') ||
      properties.includes('titlepage') ||
      properties.includes('frontmatter')
    );
  }

  private findTocNavElement(doc: Document): Element | null {
    return (
      doc.querySelector(String.raw`nav[epub\:type='toc']`) ||
      doc.querySelector("nav[role='doc-toc']") ||
      doc.querySelector("nav#toc") ||
      doc.querySelector("nav")
    );
  }
}

export class FB2Parser extends BaseBookParser {
  /**
   * Автоопределение кодировки и декодирование содержимого FB2 файла
   */
  private detectAndDecodeContent(fileBuffer: Buffer): string {
    const content = fileBuffer.toString('utf-8');
    const encodingMatch = /<?xml[^>]*encoding=["']([^"']+)["']/i.exec(content);
    const declaredEncoding = encodingMatch?.[1]?.toLowerCase();

    if (declaredEncoding && declaredEncoding !== 'utf-8' && declaredEncoding !== 'utf8') {
      return this.tryDecodeWithEncoding(fileBuffer, declaredEncoding, content);
    }

    if (this.hasEncodingIssues(content)) {
      return this.tryDecodeWindows1251(fileBuffer, content);
    }

    return content;
  }

  /**
   * Пытается декодировать с указанной кодировкой
   */
  private tryDecodeWithEncoding(fileBuffer: Buffer, encoding: string, fallback: string): string {
    logger.info({ encoding }, '[FB2Parser] Detected encoding from XML declaration');
    try {
      if (encoding === 'windows-1251' || encoding === 'cp1251') {
        return this.decodeWindows1251(fileBuffer);
      }
      logger.warn({ encoding }, '[FB2Parser] Unsupported encoding, using UTF-8 fallback');
    } catch (error) {
      console.warn(`⚠️ [FB2Parser] Failed to decode with ${encoding}:`, error);
    }
    return fallback;
  }

  /**
   * Пытается декодировать из Windows-1251 с обработкой ошибок
   */
  private tryDecodeWindows1251(fileBuffer: Buffer, fallback: string): string {
    logger.warn('[FB2Parser] Detected encoding issues, trying Windows-1251 decode');
    try {
      return this.decodeWindows1251(fileBuffer);
    } catch (error) {
      console.warn(`⚠️ [FB2Parser] Windows-1251 decode failed, using original content:`, error);
      return fallback;
    }
  }

  /**
   * Проверяет наличие проблем с кодировкой (кракозябры)
   */
  private hasEncodingIssues(content: string): boolean {
    // Ищем характерные паттерны неправильной кодировки
    const badPatterns = [
      /Ð[À-ß]/g,  // Типичные кракозябры от неправильной кодировки
      /â€/g,       // Еще один паттерн
      /Ã[€¿]/g,    // Исправлено: отдельные символы вместо диапазона
    ];

    return badPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Декодирует содержимое из Windows-1251
   */
  private decodeWindows1251(buffer: Buffer): string {
    // Полная таблица перекодировки Windows-1251 -> UTF-8 (включая все спецсимволы)
    const cp1251Map: { [key: number]: string } = {
      // Кириллица заглавные буквы (0xC0-0xDF)
      0xC0: 'А', 0xC1: 'Б', 0xC2: 'В', 0xC3: 'Г', 0xC4: 'Д', 0xC5: 'Е', 0xC6: 'Ж', 0xC7: 'З',
      0xC8: 'И', 0xC9: 'Й', 0xCA: 'К', 0xCB: 'Л', 0xCC: 'М', 0xCD: 'Н', 0xCE: 'О', 0xCF: 'П',
      0xD0: 'Р', 0xD1: 'С', 0xD2: 'Т', 0xD3: 'У', 0xD4: 'Ф', 0xD5: 'Х', 0xD6: 'Ц', 0xD7: 'Ч',
      0xD8: 'Ш', 0xD9: 'Щ', 0xDA: 'Ъ', 0xDB: 'Ы', 0xDC: 'Ь', 0xDD: 'Э', 0xDE: 'Ю', 0xDF: 'Я',
      // Кириллица строчные буквы (0xE0-0xFF)
      0xE0: 'а', 0xE1: 'б', 0xE2: 'в', 0xE3: 'г', 0xE4: 'д', 0xE5: 'е', 0xE6: 'ж', 0xE7: 'з',
      0xE8: 'и', 0xE9: 'й', 0xEA: 'к', 0xEB: 'л', 0xEC: 'м', 0xED: 'н', 0xEE: 'о', 0xEF: 'п',
      0xF0: 'р', 0xF1: 'с', 0xF2: 'т', 0xF3: 'у', 0xF4: 'ф', 0xF5: 'х', 0xF6: 'ц', 0xF7: 'ч',
      0xF8: 'ш', 0xF9: 'щ', 0xFA: 'ъ', 0xFB: 'ы', 0xFC: 'ь', 0xFD: 'э', 0xFE: 'ю', 0xFF: 'я',
      // Ё/ё
      0xA8: 'Ё', 0xB8: 'ё',
      // Специальные символы Windows-1251 (0x80-0xBF) - КРИТИЧЕСКИ ВАЖНО!
      0x80: '\u0402', 0x81: '\u0403', 0x82: '\u201A', 0x83: '\u0453', 0x84: '\u201E',
      0x85: '\u2026', // Многоточие ... (КРИТИЧНО!)
      0x86: '\u2020', 0x87: '\u2021', 0x88: '\u20AC', 0x89: '\u2030', 0x8A: '\u0409',
      0x8B: '\u2039', // Левая одиночная угловая кавычка ‹
      0x8C: '\u040A', 0x8D: '\u040C', 0x8E: '\u040B', 0x8F: '\u040F',
      0x90: '\u0452', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D',
      0x95: '\u2022', // Буллет •
      0x96: '\u2013', // Короткое тире –
      0x97: '\u2014', // Длинное тире —
      0x98: '\u0098', 0x99: '\u2122', 0x9A: '\u0459',
      0x9B: '\u203A', // Правая одиночная угловая кавычка ›
      0x9C: '\u045A', 0x9D: '\u045C', 0x9E: '\u045B', 0x9F: '\u045F',
      0xA0: '\u00A0', // Неразрывный пробел
      0xA1: '\u040E', 0xA2: '\u045E', 0xA3: '\u0408', 0xA4: '\u00A4', 0xA5: '\u0490',
      0xA6: '\u00A6', 0xA7: '\u00A7', 0xA9: '\u00A9', 0xAA: '\u0404',
      0xAB: '\u00AB', // Левая кавычка-ёлочка « (КРИТИЧНО!)
      0xAC: '\u00AC', 0xAD: '\u00AD', 0xAE: '\u00AE', 0xAF: '\u0407',
      0xB0: '\u00B0', 0xB1: '\u00B1', 0xB2: '\u0406', 0xB3: '\u0456', 0xB4: '\u0491',
      0xB5: '\u00B5', 0xB6: '\u00B6', 0xB7: '\u00B7', 0xB9: '\u2116', // Номер №
      0xBA: '\u0454',
      0xBB: '\u00BB', // Правая кавычка-ёлочка » (КРИТИЧНО!)
      0xBC: '\u0458', 0xBD: '\u0405', 0xBE: '\u0455', 0xBF: '\u0457'
    };

    let result = '';
    for (const byte of buffer) {
      if (cp1251Map[byte]) {
        result += cp1251Map[byte];
      } else if (byte < 128) {
        // ASCII символы остаются как есть
        result += String.fromCodePoint(byte);
      } else {
        // Неизвестные символы заменяем на ?
        result += '?';
      }
    }

    return result;
  }

  private looksLikeFb2Document(content: string): boolean {
    const header = content.slice(0, 8192).toLowerCase();
    return header.includes('<fictionbook');
  }

  async parseBook(fileBuffer: Buffer, filename: string): Promise<ParsedBook> {
    try {
      this.assertInputSize(fileBuffer);

      // Автоопределение кодировки для корректной обработки кириллицы
      const content = this.detectAndDecodeContent(fileBuffer);
      const xmlBytes = Buffer.byteLength(content, 'utf8');

      if (xmlBytes > MAX_FB2_XML_BYTES) {
        throw new Error(`FB2 XML exceeds limit of ${Math.round(MAX_FB2_XML_BYTES / 1024 / 1024)} MB`);
      }

      if (!this.looksLikeFb2Document(content)) {
        throw new Error('Invalid FB2 payload: FictionBook tag was not detected');
      }

      const parser = new xml2js.Parser();
      const fb2Data = await this.withTimeout(
        parser.parseStringPromise(content),
        'Parse FB2 XML',
      );

      const fictionBook = fb2Data?.FictionBook as XmlElement | undefined;
      if (!fictionBook) {
        throw new Error('Invalid FB2 format: FictionBook element not found');
      }

      // Извлечь метаданные
      const metadata = await this.extractMetadata(fictionBook);

      // Извлечь главы через DOM-парсинг (сохраняет порядок чередования элементов)
      const chapters = this.extractChaptersFromDom(content);

      // Вычислить хеш содержимого
      const contentHash = this.calculateTextContentHash(chapters);

      return {
        metadata: {
          ...metadata,
          totalChapters: chapters.length,
          contentHash,
        },
        chapters,
        originalFilename: filename,
        fileType: 'fb2',
      };
    } catch (error) {
      console.error('Error parsing FB2:', error);
      throw new Error(`Failed to parse FB2: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractMetadata(fictionBook: XmlElement): Promise<Omit<BookMetadata, 'totalChapters'>> {
    const description = (fictionBook?.description as XmlElement[] | undefined)?.[0];
    if (!description) {
      throw new Error('No description section found in FB2');
    }

    const titleInfo = (description['title-info'] as XmlElement[] | undefined)?.[0];
    const publishInfo = (description['publish-info'] as XmlElement[] | undefined)?.[0];

    // Извлечь основные метаданные
    const title = this.extractFB2Text(titleInfo?.['book-title']);
    const author = this.extractAuthorName(titleInfo?.author);
    const description_text = this.extractFB2Text(titleInfo?.annotation);
    const isbn = this.extractFB2Text(publishInfo?.isbn);
    const genres = this.extractFB2Values(titleInfo?.genre);
    const language = (titleInfo?.lang as string[] | undefined)?.[0]
      || (titleInfo?.['src-lang'] as string[] | undefined)?.[0];
    const publisher = this.extractFB2Text(publishInfo?.publisher);
    const publishDate = Array.isArray(publishInfo?.year)
      ? (publishInfo?.year[0] as string | undefined)
      : undefined;

    // Попытаться найти обложку
    let coverImageData: Buffer | undefined;
    let coverImageType: string | undefined;

    try {
      const coverInfo = this.findCoverImage(fictionBook);
      if (coverInfo) {
        const decodedCover = Buffer.from(coverInfo.data, 'base64');
        if (decodedCover.length <= MAX_FB2_COVER_BYTES) {
          coverImageData = decodedCover;
          coverImageType = coverInfo.type;
        } else {
          logger.warn(
            { coverBytes: decodedCover.length, maxBytes: MAX_FB2_COVER_BYTES },
            '[FB2Parser] Skipping oversized cover image',
          );
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Could not extract cover image');
    }

    return {
      title: title || 'Unknown Title',
      author: author || 'Unknown Author',
      description: description_text,
      isbn,
      genre: genres[0],
      genres,
      language,
      publisher,
      publishDate,
      coverImageData,
      coverImageType,
    };
  }

  private extractFB2Text(element: unknown): string | undefined {
    if (!element || !Array.isArray(element)) return undefined;

    const firstElement = element[0] as unknown;
    if (typeof firstElement === 'string') return firstElement;
    if (typeof firstElement === 'object') {
      // Извлечь текст из вложенных элементов
      return this.extractTextFromFB2Element(firstElement);
    }

    return undefined;
  }

  private extractFB2Values(element: unknown): string[] {
    if (!Array.isArray(element)) return [];

    const values: string[] = [];

    for (const item of element) {
      if (typeof item === 'string') {
        const normalized = item.trim();
        if (normalized) values.push(normalized);
        continue;
      }

      if (typeof item === 'object' && item !== null) {
        const text = this.extractTextFromFB2Element(item).trim();
        if (text) values.push(text);
      }
    }

    return Array.from(new Set(values));
  }

  private extractTextFromFB2Element(element: unknown): string {
    if (typeof element === 'string') return element;
    if (!element) return '';

    let text = '';

    // Извлечь прямой текст
    const xmlElement = element as XmlElement;
    if (typeof xmlElement._ === 'string') text += xmlElement._;

    // Рекурсивно извлечь из дочерних элементов
    Object.keys(xmlElement).forEach(key => {
      if (key !== '$' && key !== '_') {
        const childElement = xmlElement[key];
        if (Array.isArray(childElement)) {
          childElement.forEach(child => {
            text += this.extractTextFromFB2Element(child);
          });
        }
      }
    });

    return text;
  }

  private extractAuthorName(authors: unknown): string | undefined {
    if (!authors || !Array.isArray(authors)) return undefined;

    const author = authors[0] as XmlElement | undefined;
    if (!author) return undefined;

    const firstName = this.extractFB2Text(author['first-name']) || '';
    const middleName = this.extractFB2Text(author['middle-name']) || '';
    const lastName = this.extractFB2Text(author['last-name']) || '';

    return [firstName, middleName, lastName].filter(Boolean).join(' ') || undefined;
  }

  private findCoverImage(fictionBook: XmlElement): { data: string; type: string } | null {
    const binaries = fictionBook?.binary as XmlElement[] | undefined;
    if (!binaries || !Array.isArray(binaries)) return null;

    // 1. Попытка найти ID обложки из метаданных (description -> title-info -> coverpage -> image)
    const description = (fictionBook?.description as XmlElement[] | undefined)?.[0];
    const titleInfo = (description?.['title-info'] as XmlElement[] | undefined)?.[0];
    const coverpage = (titleInfo?.coverpage as XmlElement[] | undefined)?.[0];
    const coverImage = (coverpage?.image as XmlElement[] | undefined)?.[0];

    const coverImageId = getXmlAttribute(coverImage, 'href')?.replace(/^#/, '');

    if (coverImageId) {
      const binary = binaries.find((b) => b.$?.id === coverImageId);
      const exactCover = this.buildFb2BinaryImage(binary);
      if (exactCover) return exactCover;
    }

    // 2. Fallback: Ищем бинарник с ID, содержащим "cover"
    const coverBinary = binaries.find((b) => {
      const id = b.$?.id?.toLowerCase();
      return id && (id.includes('cover') || id === 'cover.jpg' || id === 'cover.png');
    });

    const namedCover = this.buildFb2BinaryImage(coverBinary);
    if (namedCover) return namedCover;

    // 3. Fallback: Ищем первое изображение (старая логика)
    for (const binary of binaries) {
      const firstImage = this.buildFb2BinaryImage(binary, true);
      if (firstImage) return firstImage;
    }

    return null;
  }

  private buildFb2BinaryImage(binary: XmlElement | undefined, requireImageContentType = false): { data: string; type: string } | null {
    if (!binary) return null;

    const contentType = binary.$?.['content-type'];
    if (requireImageContentType && !contentType?.startsWith('image/')) {
      return null;
    }

    return {
      data: typeof binary._ === 'string' ? binary._ : '',
      type: contentType || 'image/jpeg',
    };
  }

  private extractChapters(fictionBook: XmlElement): BookChapter[] {
    const body = fictionBook?.body as XmlElement[] | undefined;
    if (!body || !Array.isArray(body)) return [];

    const chapters: BookChapter[] = [];
    let chapterNumber = 1;

    // Обработать каждый body (может быть несколько)
    body.forEach((bodyElement) => {
      // Фильтр: пропускаем body с name="notes" (сноски, примечания)
      const bodyName = bodyElement?.$?.name?.toLowerCase();
      if (bodyName === 'notes' || bodyName === 'comments') {
        logger.info({ bodyName }, '[FB2Parser] Skipping body section');
        return; // Пропускаем это body
      }

      const sections = bodyElement?.section as XmlElement[] | undefined ?? [];

      sections.forEach((section) => {
        if (chapters.length >= MAX_BOOK_CHAPTERS) {
          return;
        }

        chapterNumber = this.appendSectionChapters(section, chapters, chapterNumber, []);
      });
    });

    return chapters;
  }

  private appendSectionChapters(
    section: XmlElement,
    chapters: BookChapter[],
    chapterNumber: number,
    ancestorTitles: string[],
  ): number {
    if (chapters.length >= MAX_BOOK_CHAPTERS) {
      return chapterNumber;
    }

    const sectionTitle = this.extractSectionTitle(section);
    const childSections = asArray<XmlElement>(section?.section);
    const directContent = this.extractSectionOwnContent(section);
    const directWordCount = this.countWords(directContent);
    const nextAncestorTitles = sectionTitle?.trim()
      ? [...ancestorTitles, sectionTitle.trim()]
      : ancestorTitles;

    if (this.shouldSplitSectionIntoChildChapters(section, childSections, directWordCount)) {
      const hasMeaningfulIntro = directWordCount >= 80;

      if (hasMeaningfulIntro) {
        const title = sectionTitle || this.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);
        chapters.push({
          chapterNumber,
          title,
          content: directContent,
          wordCount: directWordCount,
        });
        chapterNumber += 1;
      }

      for (const childSection of childSections) {
        if (chapters.length >= MAX_BOOK_CHAPTERS) {
          break;
        }

        chapterNumber = this.appendSectionChapters(childSection, chapters, chapterNumber, nextAncestorTitles);
      }

      return chapterNumber;
    }

    const chapterContent = this.extractSectionContent(section);
    if (chapterContent.trim()) {
      const title = sectionTitle || this.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);

      chapters.push({
        chapterNumber,
        title,
        content: chapterContent,
        wordCount: this.countWords(chapterContent),
      });
      return chapterNumber + 1;
    }

    return chapterNumber;
  }

  private shouldSplitSectionIntoChildChapters(
    section: XmlElement,
    childSections: XmlElement[],
    directWordCount: number,
  ): boolean {
    if (childSections.length === 0) {
      return false;
    }

    const titledChildSections = childSections.filter((childSection) => {
      const title = this.extractSectionTitle(childSection);
      return Boolean(title && title.trim().length > 0);
    });

    if (titledChildSections.length === 0) {
      return false;
    }

    const sectionTitle = this.extractSectionTitle(section);
    const isContainerLike = directWordCount < 80;
    const nonStructuralChildTitles = titledChildSections.filter((childSection) => {
      const title = this.extractSectionTitle(childSection);
      return title ? !this.isStructuralSubsectionTitle(title) : false;
    });
    const structuralChildTitles = titledChildSections.filter((childSection) => {
      const title = this.extractSectionTitle(childSection);
      return title ? this.isStructuralSubsectionTitle(title) : false;
    });

    if (childSections.length >= 2 && isContainerLike && nonStructuralChildTitles.length >= 2) {
      return true;
    }

    if (childSections.length >= 2 && isContainerLike && structuralChildTitles.length >= 1) {
      return true;
    }

    if (childSections.length === 1 && !sectionTitle && directWordCount < 30 && nonStructuralChildTitles.length === 1) {
      return true;
    }

    return false;
  }

  private isStructuralSubsectionTitle(title: string): boolean {
    const normalized = title.trim().replaceAll(/\s+/g, ' ').toLowerCase();

    if (!normalized) {
      return true;
    }

    if (STRUCTURAL_FB2_SECTION_TITLES.includes(normalized as typeof STRUCTURAL_FB2_SECTION_TITLES[number])) {
      return true;
    }

    if (isArabicOrRomanSectionMarker(normalized)) {
      return true;
    }

    const [prefix, marker] = normalized.split(' ', 2);
    if (!prefix || !marker || !STRUCTURAL_FB2_SECTION_PREFIXES.includes(prefix as typeof STRUCTURAL_FB2_SECTION_PREFIXES[number])) {
      return false;
    }

    return isArabicOrRomanSectionMarker(marker)
      || STRUCTURAL_FB2_SECTION_ORDINALS.includes(marker as typeof STRUCTURAL_FB2_SECTION_ORDINALS[number]);
  }

  private buildFallbackSectionTitle(ancestorTitles: string[], chapterNumber: number, preferIntroLabel = false): string {
    const nearestAncestorTitle = [...ancestorTitles]
      .reverse()
      .find((title) => title.trim().length > 0);

    if (nearestAncestorTitle) {
      return preferIntroLabel ? `${nearestAncestorTitle} — вступление` : nearestAncestorTitle;
    }

    return `Chapter ${chapterNumber}`;
  }

  private extractSectionTitle(section: XmlElement): string | undefined {
    const title = section?.title as XmlElement[] | undefined;
    if (!title || !Array.isArray(title)) return undefined;

    const titleElement = title[0] as XmlElement | undefined;
    
    // Если в заголовке несколько параграфов (обычно автор + название в антологиях)
    const paragraphs = titleElement?.p as XmlElement[] | undefined;
    if (Array.isArray(paragraphs) && paragraphs.length > 1) {
      const parts = paragraphs
        .map((p) => this.extractTextFromFB2Element(p))
        .filter((text: string) => text?.trim());
      
      // Соединяем через точку с пробелом: "Автор. Название"
      return parts.join('. ');
    }
    
    // Обычный заголовок - один параграф
    return this.extractTextFromFB2Element(titleElement);
  }

  private extractSectionContent(section: XmlElement): string {
    let content = '';

    // Обработать заголовок секции как <h3>
    const sectionTitle = this.extractSectionTitle(section);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.escapeHtml(sectionTitle)}</h3>\n`;
    }

    // Обработать все элементы секции в порядке их появления
    Object.keys(section).forEach((key) => {
      if (key === '$' || key === 'title' || key === 'section') {
        return; // Пропускаем атрибуты, заголовок (уже обработан) и подсекции (обработаем позже)
      }

      const elements = asArray<XmlElement>(section[key]);

      elements.forEach((element) => {
        const elementContent = this.processFB2Element(key, element);
        if (elementContent) {
          content += elementContent;
        }
      });
    });

    // Рекурсивно обработать подсекции
    const subsections = section?.section as XmlElement[] | undefined ?? [];
    subsections.forEach((subsection) => {
      content += this.extractSectionContent(subsection);
    });

    return content;
  }

  /**
   * Обработка отдельного FB2 элемента с сохранением структуры
   */
  private processFB2Element(tagName: string, element: XmlElement): string {
    switch (tagName) {
      case 'p':
        return this.processFB2Paragraph(element);
      
      case 'subtitle':
        return `<h4>${this.processFB2InlineContent(element)}</h4>\n`;
      
      case 'epigraph':
        return this.processFB2Epigraph(element);
      
      case 'cite':
        return this.processFB2Cite(element);
      
      case 'annotation':
        return this.processFB2Annotation(element);
      
      case 'poem':
        return this.processFB2Poem(element);
      
      case 'stanza':
        return this.processFB2Stanza(element);
      
      case 'table':
        return this.processFB2Table(element);
      
      case 'empty-line':
        return '<br>\n';
      
      case 'image':
        return this.processFB2Image(element);
      
      case 'text-author':
        return `<p class="text-author"><em>${this.processFB2InlineContent(element)}</em></p>\n`;
      
      default: {
        // Для неизвестных тегов просто извлекаем текст
        const text = this.extractTextFromFB2Element(element);
        return text.trim() ? `<p>${this.escapeHtml(text)}</p>\n` : '';
      }
    }
  }

  /**
   * Обработка параграфа с поддержкой inline форматирования
   */
  private processFB2Paragraph(element: XmlElement): string {
    const content = this.processFB2InlineContent(element);
    return content.trim() ? `<p>${content}</p>\n` : '';
  }

  /**
   * Обработка inline содержимого (с форматированием)
   */
  private processFB2InlineContent(element: XmlElement): string {
    if (typeof element === 'string') {
      return this.escapeHtml(element);
    }

    let result = '';

    // Прямой текст узла
    if (typeof element._ === 'string') {
      result += this.escapeHtml(element._);
    }

    // Обработка дочерних элементов
    Object.keys(element).forEach((key) => {
      if (key === '$' || key === '_') {
        return;
      }

      const children = asArray<XmlElement>(element[key]);

      children.forEach((child) => {
        switch (key) {
          case 'strong':
            result += `<strong>${this.processFB2InlineContent(child)}</strong>`;
            break;
          
          case 'emphasis':
            result += `<em>${this.processFB2InlineContent(child)}</em>`;
            break;
          
          case 'strikethrough':
            result += `<del>${this.processFB2InlineContent(child)}</del>`;
            break;
          
          case 'sub':
            result += `<sub>${this.processFB2InlineContent(child)}</sub>`;
            break;
          
          case 'sup':
            result += `<sup>${this.processFB2InlineContent(child)}</sup>`;
            break;
          
          case 'code':
            result += `<code>${this.processFB2InlineContent(child)}</code>`;
            break;
          
          case 'a':
            result += this.processFB2Link(child);
            break;
          
          case 'image':
            result += this.processFB2Image(child);
            break;
          
          default:
            // Для неизвестных inline элементов просто извлекаем текст
            result += this.processFB2InlineContent(child);
        }
      });
    });

    return result;
  }

  /**
   * Обработка ссылок
   */
  private processFB2Link(element: XmlElement): string {
    const href = element.$?.['l:href'] || element.$?.href || '#';
    const text = this.processFB2InlineContent(element);
    
    // Внешние ссылки открываем в новом окне
    const isExternal = href.startsWith('http://') || href.startsWith('https://');
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    
    return `<a href="${this.escapeHtml(href)}"${target}>${text}</a>`;
  }

  /**
   * Обработка изображений
   */
  private processFB2Image(element: XmlElement): string {
    const href = getXmlAttribute(element, 'href');
    if (!href) return '';

    const alt = element.$?.alt || 'Image';
    return `<img src="${this.escapeHtml(href)}" alt="${this.escapeHtml(alt)}" class="fb2-image">`;
  }

  /**
   * Обработка эпиграфа
   */
  private processFB2Epigraph(element: XmlElement): string {
    let content = '<blockquote class="epigraph">\n';
    
    const paragraphs = asArray<XmlElement>(element.p);
    paragraphs.forEach((p) => {
      content += `<p>${this.processFB2InlineContent(p)}</p>\n`;
    });
    
    const textAuthors = asArray<XmlElement>(element['text-author']);
    textAuthors.forEach((author) => {
      content += `<p class="text-author"><em>${this.processFB2InlineContent(author)}</em></p>\n`;
    });
    
    content += '</blockquote>\n';
    return content;
  }

  /**
   * Обработка цитаты
   */
  private processFB2Cite(element: XmlElement): string {
    let content = '<blockquote class="cite">\n';
    
    const paragraphs = asArray<XmlElement>(element.p);
    paragraphs.forEach((p) => {
      content += `<p>${this.processFB2InlineContent(p)}</p>\n`;
    });
    
    const subtitles = asArray<XmlElement>(element.subtitle);
    subtitles.forEach((subtitle) => {
      content += `<h5>${this.processFB2InlineContent(subtitle)}</h5>\n`;
    });
    
    const textAuthors = asArray<XmlElement>(element['text-author']);
    textAuthors.forEach((author) => {
      content += `<p class="text-author"><em>${this.processFB2InlineContent(author)}</em></p>\n`;
    });
    
    content += '</blockquote>\n';
    return content;
  }

  /**
   * Обработка аннотации
   */
  private processFB2Annotation(element: XmlElement): string {
    let content = '<div class="annotation">\n';
    
    const paragraphs = asArray<XmlElement>(element.p);
    paragraphs.forEach((p) => {
      content += `<p>${this.processFB2InlineContent(p)}</p>\n`;
    });
    
    const poems = asArray<XmlElement>(element.poem);
    poems.forEach((poem) => {
      content += this.processFB2Poem(poem);
    });
    
    const subtitles = asArray<XmlElement>(element.subtitle);
    subtitles.forEach((subtitle) => {
      content += `<h5>${this.processFB2InlineContent(subtitle)}</h5>\n`;
    });
    
    content += '</div>\n';
    return content;
  }

  /**
   * Обработка поэмы/стихотворения
   */
  private processFB2Poem(element: XmlElement): string {
    let content = '<div class="poem">\n';
    
    const titles = asArray<XmlElement>(element.title);
    titles.forEach((title) => {
      const titleText = this.extractTextFromFB2Element(title);
      if (titleText.trim()) {
        content += `<h5 class="poem-title">${this.escapeHtml(titleText)}</h5>\n`;
      }
    });
    
    const stanzas = asArray<XmlElement>(element.stanza);
    stanzas.forEach((stanza) => {
      content += this.processFB2Stanza(stanza);
    });
    
    const textAuthors = asArray<XmlElement>(element['text-author']);
    textAuthors.forEach((author) => {
      content += `<p class="text-author"><em>${this.processFB2InlineContent(author)}</em></p>\n`;
    });
    
    content += '</div>\n';
    return content;
  }

  /**
   * Обработка строфы
   */
  private processFB2Stanza(element: XmlElement): string {
    let content = '<div class="stanza">\n';
    
    const titles = asArray<XmlElement>(element.title);
    titles.forEach((title) => {
      const titleText = this.extractTextFromFB2Element(title);
      if (titleText.trim()) {
        content += `<h6 class="stanza-title">${this.escapeHtml(titleText)}</h6>\n`;
      }
    });
    
    const subtitles = asArray<XmlElement>(element.subtitle);
    subtitles.forEach((subtitle) => {
      content += `<p class="stanza-subtitle"><em>${this.processFB2InlineContent(subtitle)}</em></p>\n`;
    });
    
    const verses = asArray<XmlElement>(element.v);
    verses.forEach((verse) => {
      const verseText = this.processFB2InlineContent(verse);
      if (verseText.trim()) {
        content += `<p class="verse">${verseText}</p>\n`;
      }
    });
    
    content += '</div>\n';
    return content;
  }

  /**
   * Обработка таблицы
   */
  private processFB2Table(element: XmlElement): string {
    let content = '<table class="fb2-table">\n';
    
    const rows = asArray<XmlElement>(element.tr);
    rows.forEach((row) => {
      content += '<tr>\n';
      
      const cells = [
        ...asArray<XmlElement>(row.th).map(cell => ({ cell, isHeader: true })),
        ...asArray<XmlElement>(row.td).map(cell => ({ cell, isHeader: false }))
      ];
      
      cells.forEach(({ cell, isHeader }) => {
        const tag = isHeader ? 'th' : 'td';
        const cellContent = this.processFB2InlineContent(cell);
        
        // Обработка атрибутов colspan, rowspan, align, valign
        const colspan = cell.$?.colspan;
        const rowspan = cell.$?.rowspan;
        const align = cell.$?.align;
        const valign = cell.$?.valign;
        
        let attrs = '';
        if (colspan) attrs += ` colspan="${this.escapeHtml(String(colspan))}"`;
        if (rowspan) attrs += ` rowspan="${this.escapeHtml(String(rowspan))}"`;
        if (align) attrs += ` align="${this.escapeHtml(String(align))}"`;
        if (valign) attrs += ` valign="${this.escapeHtml(String(valign))}"`;
        
        content += `<${tag}${attrs}>${cellContent}</${tag}>\n`;
      });
      
      content += '</tr>\n';
    });
    
    content += '</table>\n';
    return content;
  }

  private extractSectionOwnContent(section: XmlElement): string {
    let content = '';

    const sectionTitle = this.extractSectionTitle(section);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.escapeHtml(sectionTitle)}</h3>\n`;
    }

    // Обработать все элементы секции (кроме подсекций) в порядке их появления
    Object.keys(section).forEach((key) => {
      if (key === '$' || key === 'title' || key === 'section') {
        return; // Пропускаем атрибуты, заголовок (уже обработан) и подсекции
      }

      const elements = asArray<XmlElement>(section[key]);

      elements.forEach((element) => {
        const elementContent = this.processFB2Element(key, element);
        if (elementContent) {
          content += elementContent;
        }
      });
    });

    return content;
  }

  // ─── DOM-based chapter extraction ───────────────────────────────────────────
  // Используем JSDOM для обхода FB2 body, чтобы сохранить порядок чередования
  // элементов (xml2js группирует все <p> вместе, теряя чередование p/cite/p).

  private extractChaptersFromDom(xmlContent: string): BookChapter[] {
    let dom: InstanceType<typeof JSDOM>;
    try {
      dom = new JSDOM(xmlContent, { contentType: 'text/xml' });
    } catch (error) {
      logger.warn({ error }, '[FB2Parser] JSDOM parse failed for body extraction');
      return [];
    }

    const doc = dom.window.document;
    const binaryMap = this.buildFb2BinaryMapFromDom(doc);
    const chapters: BookChapter[] = [];
    let chapterNumber = 1;

    const bodyEls = Array.from(doc.getElementsByTagName('body'));
    for (const body of bodyEls) {
      const bodyName = body.getAttribute('name')?.toLowerCase();
      if (bodyName === 'notes' || bodyName === 'comments') continue;

      const sectionEls = Array.from(body.children).filter(el => el.localName === 'section');
      for (const section of sectionEls) {
        if (chapters.length >= MAX_BOOK_CHAPTERS) break;
        chapterNumber = this.appendDomSectionChapters(section, chapters, chapterNumber, [], binaryMap);
      }
    }

    return chapters;
  }

  private appendDomSectionChapters(
    sectionEl: Element,
    chapters: BookChapter[],
    chapterNumber: number,
    ancestorTitles: string[],
    binaryMap: Map<string, string>,
  ): number {
    if (chapters.length >= MAX_BOOK_CHAPTERS) return chapterNumber;

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    const childSectionEls = Array.from(sectionEl.children).filter(el => el.localName === 'section');
    const directContent = this.getDomSectionOwnContent(sectionEl, binaryMap);
    const directWordCount = this.countWords(directContent);

    const nextAncestorTitles = sectionTitle?.trim()
      ? [...ancestorTitles, sectionTitle.trim()]
      : ancestorTitles;

    if (this.shouldSplitDomSection(sectionEl, childSectionEls, directWordCount)) {
      if (directWordCount >= 80) {
        const title = sectionTitle || this.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);
        chapters.push({ chapterNumber, title, content: directContent, wordCount: directWordCount });
        chapterNumber += 1;
      }

      for (const childSection of childSectionEls) {
        if (chapters.length >= MAX_BOOK_CHAPTERS) break;
        chapterNumber = this.appendDomSectionChapters(childSection, chapters, chapterNumber, nextAncestorTitles, binaryMap);
      }

      return chapterNumber;
    }

    const content = this.getDomSectionContent(sectionEl, binaryMap);
    if (content.trim()) {
      const title = sectionTitle || this.buildFallbackSectionTitle(ancestorTitles, chapterNumber, true);
      chapters.push({ chapterNumber, title, content, wordCount: this.countWords(content) });
      return chapterNumber + 1;
    }

    return chapterNumber;
  }

  private shouldSplitDomSection(
    sectionEl: Element,
    childSectionEls: Element[],
    directWordCount: number,
  ): boolean {
    if (childSectionEls.length === 0) return false;

    const titledChildren = childSectionEls.filter(el => Boolean(this.getDomSectionTitle(el)?.trim()));
    if (titledChildren.length === 0) return false;

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    const isContainerLike = directWordCount < 80;

    const nonStructural = titledChildren.filter(el => {
      const t = this.getDomSectionTitle(el);
      return t ? !this.isStructuralSubsectionTitle(t) : false;
    });
    const structural = titledChildren.filter(el => {
      const t = this.getDomSectionTitle(el);
      return t ? this.isStructuralSubsectionTitle(t) : false;
    });

    if (childSectionEls.length >= 2 && isContainerLike && nonStructural.length >= 2) return true;
    if (childSectionEls.length >= 2 && isContainerLike && structural.length >= 1) return true;
    if (childSectionEls.length === 1 && !sectionTitle && directWordCount < 30 && nonStructural.length === 1) return true;

    return false;
  }

  private getDomSectionTitle(sectionEl: Element): string | undefined {
    const titleEl = Array.from(sectionEl.children).find(el => el.localName === 'title');
    if (!titleEl) return undefined;

    const paragraphs = Array.from(titleEl.children).filter(el => el.localName === 'p');
    if (paragraphs.length > 1) {
      const parts = paragraphs.map(p => p.textContent?.trim() || '').filter(Boolean);
      return parts.length > 0 ? parts.join('. ') : undefined;
    }

    return titleEl.textContent?.trim() || undefined;
  }

  private getDomSectionOwnContent(sectionEl: Element, binaryMap: Map<string, string>): string {
    let content = '';

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.escapeHtml(sectionTitle)}</h3>\n`;
    }

    for (const child of Array.from(sectionEl.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === 'title' || el.localName === 'section') continue;
      content += this.renderFB2DomElement(el, binaryMap);
    }

    return content;
  }

  private getDomSectionContent(sectionEl: Element, binaryMap: Map<string, string>): string {
    let content = '';

    const sectionTitle = this.getDomSectionTitle(sectionEl);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.escapeHtml(sectionTitle)}</h3>\n`;
    }

    for (const child of Array.from(sectionEl.childNodes)) {
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      if (el.localName === 'title') continue;
      if (el.localName === 'section') {
        content += this.getDomSectionContent(el, binaryMap);
        continue;
      }
      content += this.renderFB2DomElement(el, binaryMap);
    }

    return content;
  }

  private renderFB2DomElement(el: Element, binaryMap: Map<string, string>): string {
    switch (el.localName) {
      case 'p':
        return `<p>${this.renderFB2DomInline(el, binaryMap)}</p>\n`;
      case 'subtitle':
        return `<h4>${this.renderFB2DomInline(el, binaryMap)}</h4>\n`;
      case 'empty-line':
        return '<br>\n';
      case 'epigraph':
        return this.renderFB2DomEpigraph(el, binaryMap);
      case 'cite':
        return this.renderFB2DomCite(el, binaryMap);
      case 'poem':
        return this.renderFB2DomPoem(el, binaryMap);
      case 'table':
        return this.renderFB2DomTable(el, binaryMap);
      case 'image':
        return this.renderFB2DomImage(el, binaryMap);
      case 'text-author':
        return `<p class="text-author"><em>${this.renderFB2DomInline(el, binaryMap)}</em></p>\n`;
      case 'annotation':
        return this.renderFB2DomAnnotation(el, binaryMap);
      default: {
        const text = el.textContent?.trim() || '';
        return text ? `<p>${this.escapeHtml(text)}</p>\n` : '';
      }
    }
  }

  private renderFB2DomInline(el: Element, binaryMap: Map<string, string>): string {
    let result = '';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 3) {
        result += this.escapeHtml(child.textContent || '');
      } else if (child.nodeType === 1) {
        const c = child as Element;
        switch (c.localName) {
          case 'strong':       result += `<strong>${this.renderFB2DomInline(c, binaryMap)}</strong>`; break;
          case 'emphasis':     result += `<em>${this.renderFB2DomInline(c, binaryMap)}</em>`; break;
          case 'strikethrough': result += `<del>${this.renderFB2DomInline(c, binaryMap)}</del>`; break;
          case 'sub':          result += `<sub>${this.renderFB2DomInline(c, binaryMap)}</sub>`; break;
          case 'sup':          result += `<sup>${this.renderFB2DomInline(c, binaryMap)}</sup>`; break;
          case 'code':         result += `<code>${this.renderFB2DomInline(c, binaryMap)}</code>`; break;
          case 'a':            result += this.renderFB2DomLink(c, binaryMap); break;
          case 'image':        result += this.renderFB2DomImage(c, binaryMap); break;
          default:             result += this.renderFB2DomInline(c, binaryMap);
        }
      }
    }
    return result;
  }

  private renderFB2DomLink(el: Element, binaryMap: Map<string, string>): string {
    const href = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      || el.getAttribute('href')
      || '#';
    const isExternal = href.startsWith('http://') || href.startsWith('https://');
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${this.escapeHtml(href)}"${target}>${this.renderFB2DomInline(el, binaryMap)}</a>`;
  }

  private renderFB2DomImage(el: Element, binaryMap: Map<string, string>): string {
    const href = el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      || el.getAttribute('href')
      || '';
    if (!href) return '';
    const alt = el.getAttribute('alt') || 'Image';
    const resolvedSrc = binaryMap.get(href.replace(/^#/, '')) || href;
    return `<img src="${this.escapeHtml(resolvedSrc)}" alt="${this.escapeHtml(alt)}" class="fb2-image">`;
  }

  private buildFb2BinaryMapFromDom(doc: Document): Map<string, string> {
    const binaryMap = new Map<string, string>();

    for (const binaryEl of Array.from(doc.getElementsByTagName('binary'))) {
      const id = binaryEl.getAttribute('id')?.trim();
      const contentType = binaryEl.getAttribute('content-type')?.trim() || 'image/jpeg';
      const data = binaryEl.textContent?.replace(/\s+/g, '') || '';

      if (!id || !data || !contentType.startsWith('image/')) {
        continue;
      }

      binaryMap.set(id, `data:${contentType};base64,${data}`);
    }

    return binaryMap;
  }

  private renderFB2DomEpigraph(el: Element, binaryMap: Map<string, string>): string {
    let content = '<blockquote class="epigraph">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      if (c.localName === 'p') {
        content += `<p>${this.renderFB2DomInline(c, binaryMap)}</p>\n`;
      } else if (c.localName === 'text-author') {
        content += `<p class="text-author"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`;
      } else if (c.localName === 'poem') {
        content += this.renderFB2DomPoem(c, binaryMap);
      }
    }
    content += '</blockquote>\n';
    return content;
  }

  private renderFB2DomCite(el: Element, binaryMap: Map<string, string>): string {
    let content = '<blockquote class="cite">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      switch (c.localName) {
        case 'p':          content += `<p>${this.renderFB2DomInline(c, binaryMap)}</p>\n`; break;
        case 'subtitle':   content += `<h5>${this.renderFB2DomInline(c, binaryMap)}</h5>\n`; break;
        case 'text-author': content += `<p class="text-author"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`; break;
        case 'poem':       content += this.renderFB2DomPoem(c, binaryMap); break;
      }
    }
    content += '</blockquote>\n';
    return content;
  }

  private renderFB2DomPoem(el: Element, binaryMap: Map<string, string>): string {
    let content = '<div class="poem">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      switch (c.localName) {
        case 'title': {
          const t = c.textContent?.trim() || '';
          if (t) content += `<h5 class="poem-title">${this.escapeHtml(t)}</h5>\n`;
          break;
        }
        case 'stanza':      content += this.renderFB2DomStanza(c, binaryMap); break;
        case 'text-author': content += `<p class="text-author"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`; break;
      }
    }
    content += '</div>\n';
    return content;
  }

  private renderFB2DomStanza(el: Element, binaryMap: Map<string, string>): string {
    let content = '<div class="stanza">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      const c = child as Element;
      switch (c.localName) {
        case 'title': {
          const t = c.textContent?.trim() || '';
          if (t) content += `<h6 class="stanza-title">${this.escapeHtml(t)}</h6>\n`;
          break;
        }
        case 'subtitle': content += `<p class="stanza-subtitle"><em>${this.renderFB2DomInline(c, binaryMap)}</em></p>\n`; break;
        case 'v': {
          const v = this.renderFB2DomInline(c, binaryMap);
          if (v.trim()) content += `<p class="verse">${v}</p>\n`;
          break;
        }
      }
    }
    content += '</div>\n';
    return content;
  }

  private renderFB2DomTable(el: Element, binaryMap: Map<string, string>): string {
    let content = '<table class="fb2-table">\n';
    for (const row of Array.from(el.children).filter(c => c.localName === 'tr')) {
      content += '<tr>\n';
      for (const cell of Array.from(row.children)) {
        const tag = cell.localName === 'th' ? 'th' : 'td';
        let attrs = '';
        for (const a of ['colspan', 'rowspan', 'align', 'valign']) {
          const v = cell.getAttribute(a);
          if (v) attrs += ` ${a}="${this.escapeHtml(v)}"`;
        }
        content += `<${tag}${attrs}>${this.renderFB2DomInline(cell, binaryMap)}</${tag}>\n`;
      }
      content += '</tr>\n';
    }
    content += '</table>\n';
    return content;
  }

  private renderFB2DomAnnotation(el: Element, binaryMap: Map<string, string>): string {
    let content = '<div class="annotation">\n';
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 1) continue;
      content += this.renderFB2DomElement(child as Element, binaryMap);
    }
    content += '</div>\n';
    return content;
  }

  // ────────────────────────────────────────────────────────────────────────────

  private escapeHtml(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

// Factory для создания парсеров
export class BookParserFactory {
  static createParser(fileType: 'epub' | 'fb2'): BaseBookParser {
    switch (fileType) {
      case 'epub':
        return new EPUBParser();
      case 'fb2':
        return new FB2Parser();
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  private static hasZipSignature(fileBuffer: Buffer): boolean {
    if (fileBuffer.length < 4) {
      return false;
    }

    if (fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4b) {
      return false;
    }

    return (
      (fileBuffer[2] === 0x03 && fileBuffer[3] === 0x04) ||
      (fileBuffer[2] === 0x05 && fileBuffer[3] === 0x06) ||
      (fileBuffer[2] === 0x07 && fileBuffer[3] === 0x08)
    );
  }

  private static hasFb2Signature(fileBuffer: Buffer): boolean {
    const head = fileBuffer.subarray(0, 8192).toString('utf8').replace(/^\uFEFF/, '').toLowerCase();
    return head.includes('<fictionbook');
  }

  private static getZipEntryUncompressedSize(entry: unknown): number | null {
    const size = (entry as { _data?: { uncompressedSize?: unknown } })?._data?.uncompressedSize;
    return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : null;
  }

  private static async isValidEpubBuffer(fileBuffer: Buffer): Promise<boolean> {
    try {
      const zip = await this.withTimeout(
        JSZip.loadAsync(fileBuffer),
        'Inspect EPUB archive',
      );
      const files = Object.entries(zip.files).filter(([, entry]) => !entry.dir);

      if (files.length === 0 || files.length > MAX_EPUB_ENTRIES) {
        return false;
      }

      let totalUncompressed = 0;
      for (const [entryName, entry] of files) {
        const normalizedName = entryName.replaceAll('\\', '/');
        if (normalizedName.startsWith('/') || normalizedName.includes('../')) {
          return false;
        }

        const size = this.getZipEntryUncompressedSize(entry);
        if (size !== null) {
          totalUncompressed += size;
          if (totalUncompressed > MAX_EPUB_UNCOMPRESSED_BYTES) {
            return false;
          }
        }
      }

      const mimetypeFile = zip.file('mimetype');
      if (!mimetypeFile) {
        return false;
      }

      const mimetypeSize = this.getZipEntryUncompressedSize(mimetypeFile);
      if (mimetypeSize !== null && mimetypeSize > 128) {
        return false;
      }

      const mimetypeContent = await this.withTimeout(
        mimetypeFile.async('string'),
        'Read EPUB mimetype',
      );
      if (mimetypeContent.trim() !== 'application/epub+zip') {
        return false;
      }

      return Boolean(zip.file('META-INF/container.xml'));
    } catch (error) {
      logger.warn({ error }, '[BookParserFactory] Failed to validate EPUB signature');
      return false;
    }
  }

  private static withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = BOOK_PARSE_TIMEOUT_MS): Promise<T> {
    return withParseTimeout(promise, label, timeoutMs);
  }

  static async detectFileTypeFromBuffer(fileBuffer: Buffer, filename?: string): Promise<'epub' | 'fb2' | null> {
    if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
      return null;
    }

    if (fileBuffer.length > MAX_BOOK_PARSE_BYTES) {
      return null;
    }

    if (this.hasZipSignature(fileBuffer)) {
      const isValidEpub = await this.isValidEpubBuffer(fileBuffer);
      if (isValidEpub) {
        return 'epub';
      }
      return null;
    }

    if (this.hasFb2Signature(fileBuffer)) {
      return 'fb2';
    }

    // Conservative fallback for legacy FB2 files with uncommon prologs.
    if (filename && this.detectFileType(filename) === 'fb2') {
      const xmlHead = fileBuffer.subarray(0, 4096).toString('utf8').toLowerCase();
      if (xmlHead.includes('<?xml')) {
        return 'fb2';
      }
    }

    return null;
  }

  static detectFileType(filename: string): 'epub' | 'fb2' | null {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.epub':
        return 'epub';
      case '.fb2':
        return 'fb2';
      default:
        return null;
    }
  }
}
