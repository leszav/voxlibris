import * as path from 'node:path';
import * as JSZip from 'jszip';
import * as xml2js from 'xml2js';
import * as mime from 'mime-types';
import * as crypto from 'node:crypto';

export interface BookMetadata {
  title: string;
  author: string;
  description?: string;
  isbn?: string;
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
      const zip = await JSZip.loadAsync(fileBuffer);

      // Найти OPF файл (содержит метаданные)
      const opfFile = await this.findOpfFile(zip);
      if (!opfFile) {
        throw new Error('OPF file not found in EPUB');
      }

      const opfFileObject = zip.file(opfFile);
      if (!opfFileObject) {
        throw new Error('OPF file object not found');
      }

      const opfContent = await opfFileObject.async('string');
      if (!opfContent) {
        throw new Error('Failed to read OPF content');
      }

      const parser = new xml2js.Parser();
      const opfData = await parser.parseStringPromise(opfContent);

      // Извлечь метаданные
      const metadata = await this.extractMetadata(opfData, zip);

      // Извлечь главы
      const chapters = await this.extractChapters(opfData, zip, path.dirname(opfFile));

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

  private async findOpfFile(zip: any): Promise<string | null> {
    // Читаем META-INF/container.xml для поиска OPF файла
    const containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) return null;

    try {
      const containerContent = await containerFile.async('string');
      const parser = new xml2js.Parser();
      const containerData = await parser.parseStringPromise(containerContent);

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

  private async extractMetadata(opfData: any, zip: any): Promise<Omit<BookMetadata, 'totalChapters'>> {
    const metadata = opfData?.package?.metadata?.[0];
    if (!metadata) {
      throw new Error('No metadata found in OPF');
    }

    // Извлечь основные метаданные
    const title = this.extractMetaValue(metadata['dc:title']);
    const author = this.extractMetaValue(metadata['dc:creator']);
    const description = this.extractMetaValue(metadata['dc:description']);
    const isbn = this.extractMetaValue(metadata['dc:identifier']);
    const language = this.extractMetaValue(metadata['dc:language']);
    const publisher = this.extractMetaValue(metadata['dc:publisher']);
    const publishDate = this.extractMetaValue(metadata['dc:date']);

    // Попытаться найти обложку
    let coverImageData: Buffer | undefined;
    let coverImageType: string | undefined;

    try {
      const coverInfo = await this.findCoverImage(opfData, zip);
      if (coverInfo) {
        coverImageData = coverInfo.data;
        coverImageType = coverInfo.type;
      }
    } catch (error) {
      console.log('Could not extract cover image:', error);
    }

    return {
      title: title || 'Unknown Title',
      author: author || 'Unknown Author',
      description,
      isbn,
      language,
      publisher,
      publishDate,
      coverImageData,
      coverImageType,
    };
  }

  private extractMetaValue(metaArray: any[]): string | undefined {
    if (!Array.isArray(metaArray) || metaArray.length === 0) return undefined;

    const firstItem = metaArray[0];
    if (typeof firstItem === 'string') return firstItem;
    if (typeof firstItem === 'object' && firstItem._) return firstItem._;

    return undefined;
  }

  private async findCoverImage(opfData: any, zip: any): Promise<{ data: Buffer; type: string } | null> {
    const manifest = opfData?.package?.manifest?.[0]?.item || [];

    // Искать элемент с id="cover" или media-type содержащий "image"
    for (const item of manifest) {
      const id = item.$?.id;
      const href = item.$?.href;
      const mediaType = item.$?.['media-type'];

      if ((id === 'cover' || id === 'cover-image' || mediaType?.startsWith('image/')) && href) {
        try {
          const imageFile = zip.file(href);
          if (imageFile) {
            const imageData = await imageFile.async('nodebuffer');
            return {
              data: imageData,
              type: mediaType || mime.lookup(href) || 'image/jpeg',
            };
          }
        } catch (error) {
          console.log('Error reading cover image:', error);
        }
      }
    }

    return null;
  }

  private async extractChapters(opfData: any, zip: any, opfDir: string): Promise<BookChapter[]> {
    const spine = opfData?.package?.spine?.[0]?.itemref || [];
    const manifest = opfData?.package?.manifest?.[0]?.item || [];

    // Создать карту manifest items
    const manifestMap = new Map<string, any>();
    manifest.forEach((item: any) => {
      manifestMap.set(item.$?.id, item);
    });

    const chapters: BookChapter[] = [];

    for (let i = 0; i < spine.length; i++) {
      const itemRef = spine[i];
      const idref = itemRef.$?.idref;

      if (!idref) continue;

      const manifestItem = manifestMap.get(idref);
      if (!manifestItem) continue;

      const href = manifestItem.$?.href;
      if (!href) continue;

      try {
        const filePath = path.posix.join(opfDir, href);
        const chapterFile = zip.file(filePath);

        if (!chapterFile) {
          console.warn(`Chapter file not found: ${filePath}`);
          continue;
        }

        const chapterContent = await chapterFile.async('string');
        const textContent = this.extractTextFromHtml(chapterContent);

        // Попытаться извлечь заголовок из HTML
        const titleMatch = chapterContent.match(/<title[^>]*>([^<]+)<\/title>/i) ||
          chapterContent.match(/<h[1-6][^>]*>([^<]+)<\/h[1-6]>/i);

        const chapterTitle = titleMatch ? titleMatch[1].trim() : `Chapter ${i + 1}`;

        chapters.push({
          chapterNumber: i + 1,
          title: chapterTitle,
          content: textContent,
          wordCount: this.countWords(textContent),
        });
      } catch (error) {
        console.warn(`Error processing chapter ${i + 1}:`, error);
      }
    }

    return chapters;
  }
}

export class FB2Parser extends BaseBookParser {
  /**
   * Автоопределение кодировки и декодирование содержимого FB2 файла
   */
  private detectAndDecodeContent(fileBuffer: Buffer): string {
    let content = fileBuffer.toString('utf-8');
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
    console.log(`🔍 [FB2Parser] Detected encoding from XML declaration: ${encoding}`);
    try {
      if (encoding === 'windows-1251' || encoding === 'cp1251') {
        return this.decodeWindows1251(fileBuffer);
      }
      console.log(`⚠️ [FB2Parser] Unsupported encoding ${encoding}, using UTF-8 fallback`);
    } catch (error) {
      console.warn(`⚠️ [FB2Parser] Failed to decode with ${encoding}:`, error);
    }
    return fallback;
  }

  /**
   * Пытается декодировать из Windows-1251 с обработкой ошибок
   */
  private tryDecodeWindows1251(fileBuffer: Buffer, fallback: string): string {
    console.log(`🔍 [FB2Parser] Detected encoding issues, trying Windows-1251 decode`);
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

  async parseBook(fileBuffer: Buffer, filename: string): Promise<ParsedBook> {
    try {
      // Автоопределение кодировки для корректной обработки кириллицы
      const content = this.detectAndDecodeContent(fileBuffer);
      const parser = new xml2js.Parser();
      const fb2Data = await parser.parseStringPromise(content);

      const fictionBook = fb2Data?.FictionBook;
      if (!fictionBook) {
        throw new Error('Invalid FB2 format: FictionBook element not found');
      }

      // Извлечь метаданные
      const metadata = await this.extractMetadata(fictionBook);

      // Извлечь главы
      const chapters = this.extractChapters(fictionBook);

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

  private async extractMetadata(fictionBook: any): Promise<Omit<BookMetadata, 'totalChapters'>> {
    const description = fictionBook?.description?.[0];
    if (!description) {
      throw new Error('No description section found in FB2');
    }

    const titleInfo = description['title-info']?.[0];
    const publishInfo = description['publish-info']?.[0];

    // Извлечь основные метаданные
    const title = this.extractFB2Text(titleInfo?.['book-title']);
    const author = this.extractAuthorName(titleInfo?.author);
    const description_text = this.extractFB2Text(titleInfo?.annotation);
    const isbn = this.extractFB2Text(publishInfo?.isbn);
    const language = titleInfo?.lang?.[0] || titleInfo?.['src-lang']?.[0];
    const publisher = this.extractFB2Text(publishInfo?.publisher);
    const publishDate = publishInfo?.year?.[0];

    // Попытаться найти обложку
    let coverImageData: Buffer | undefined;
    let coverImageType: string | undefined;

    try {
      const coverInfo = this.findCoverImage(fictionBook);
      if (coverInfo) {
        coverImageData = Buffer.from(coverInfo.data, 'base64');
        coverImageType = coverInfo.type;
      }
    } catch (error) {
      console.log('Could not extract cover image:', error);
    }

    return {
      title: title || 'Unknown Title',
      author: author || 'Unknown Author',
      description: description_text,
      isbn,
      language,
      publisher,
      publishDate,
      coverImageData,
      coverImageType,
    };
  }

  private extractFB2Text(element: any): string | undefined {
    if (!element || !Array.isArray(element)) return undefined;

    const firstElement = element[0];
    if (typeof firstElement === 'string') return firstElement;
    if (typeof firstElement === 'object') {
      // Извлечь текст из вложенных элементов
      return this.extractTextFromFB2Element(firstElement);
    }

    return undefined;
  }

  private extractTextFromFB2Element(element: any): string {
    if (typeof element === 'string') return element;
    if (!element) return '';

    let text = '';

    // Извлечь прямой текст
    if (element._) text += element._;

    // Рекурсивно извлечь из дочерних элементов
    Object.keys(element).forEach(key => {
      if (key !== '$' && key !== '_') {
        const childElement = element[key];
        if (Array.isArray(childElement)) {
          childElement.forEach(child => {
            text += this.extractTextFromFB2Element(child);
          });
        }
      }
    });

    return text;
  }

  private extractAuthorName(authors: any): string | undefined {
    if (!authors || !Array.isArray(authors)) return undefined;

    const author = authors[0];
    if (!author) return undefined;

    const firstName = this.extractFB2Text(author['first-name']) || '';
    const middleName = this.extractFB2Text(author['middle-name']) || '';
    const lastName = this.extractFB2Text(author['last-name']) || '';

    return [firstName, middleName, lastName].filter(Boolean).join(' ') || undefined;
  }

  private findCoverImage(fictionBook: any): { data: string; type: string } | null {
    const binaries = fictionBook?.binary;
    if (!binaries || !Array.isArray(binaries)) return null;

    // 1. Попытка найти ID обложки из метаданных (description -> title-info -> coverpage -> image)
    const description = fictionBook?.description?.[0];
    const titleInfo = description?.['title-info']?.[0];
    const coverpage = titleInfo?.coverpage?.[0];
    const coverImage = coverpage?.image?.[0];

    // xml2js может сохранять namespace в ключе атрибута, например "l:href"
    let coverImageId = coverImage?.$?.['l:href'] || coverImage?.$?.['href'];

    // Удаляем префикс '#', если он есть (в FB2 ссылки обычно начинаются с #)
    if (coverImageId?.startsWith('#')) {
      coverImageId = coverImageId.substring(1);
    }

    if (coverImageId) {
      const binary = binaries.find((b: any) => b.$?.id === coverImageId);
      if (binary) {
        const contentType = binary.$?.['content-type'];
        return {
          data: binary._ || '',
          type: contentType || 'image/jpeg',
        };
      }
    }

    // 2. Fallback: Ищем бинарник с ID, содержащим "cover"
    const coverBinary = binaries.find((b: any) => {
      const id = b.$?.id?.toLowerCase();
      return id && (id.includes('cover') || id === 'cover.jpg' || id === 'cover.png');
    });

    if (coverBinary) {
      const contentType = coverBinary.$?.['content-type'];
      return {
        data: coverBinary._ || '',
        type: contentType || 'image/jpeg',
      };
    }

    // 3. Fallback: Ищем первое изображение (старая логика)
    for (const binary of binaries) {
      const contentType = binary.$?.['content-type'];
      if (contentType?.startsWith('image/')) {
        return {
          data: binary._ || '',
          type: contentType,
        };
      }
    }

    return null;
  }

  private extractChapters(fictionBook: any): BookChapter[] {
    const body = fictionBook?.body;
    if (!body || !Array.isArray(body)) return [];

    const chapters: BookChapter[] = [];
    let chapterNumber = 1;

    // Обработать каждый body (может быть несколько)
    body.forEach((bodyElement: any) => {
      // Фильтр: пропускаем body с name="notes" (сноски, примечания)
      const bodyName = bodyElement?.$?.name?.toLowerCase();
      if (bodyName === 'notes' || bodyName === 'comments') {
        console.log(`🔍 [FB2Parser] Пропуск секции <body name="${bodyName}">`);
        return; // Пропускаем это body
      }

      const sections = bodyElement?.section || [];

      sections.forEach((section: any) => {
        const chapterContent = this.extractSectionContent(section);
        if (chapterContent.trim()) {
          // Попытаться извлечь заголовок
          const title = this.extractSectionTitle(section) || `Chapter ${chapterNumber}`;

          chapters.push({
            chapterNumber: chapterNumber++,
            title,
            content: chapterContent,
            wordCount: this.countWords(chapterContent),
          });
        }
      });
    });

    return chapters;
  }

  private extractSectionTitle(section: any): string | undefined {
    const title = section?.title;
    if (!title || !Array.isArray(title)) return undefined;

    const titleElement = title[0];
    
    // Если в заголовке несколько параграфов (обычно автор + название в антологиях)
    const paragraphs = titleElement?.p;
    if (Array.isArray(paragraphs) && paragraphs.length > 1) {
      const parts = paragraphs
        .map((p: any) => this.extractTextFromFB2Element(p))
        .filter((text: string) => text?.trim());
      
      // Соединяем через точку с пробелом: "Автор. Название"
      return parts.join('. ');
    }
    
    // Обычный заголовок - один параграф
    return this.extractTextFromFB2Element(titleElement);
  }

  private extractSectionContent(section: any): string {
    let content = '';

    // Обработать заголовок секции как <h3>
    const sectionTitle = this.extractSectionTitle(section);
    if (sectionTitle?.trim()) {
      content += `<h3>${this.escapeHtml(sectionTitle)}</h3>\n`;
    }

    // Извлечь параграфы с сохранением HTML структуры
    const paragraphs = section?.p || [];
    paragraphs.forEach((paragraph: any) => {
      const paragraphText = this.extractTextFromFB2Element(paragraph);
      if (paragraphText.trim()) {
        content += `<p>${this.escapeHtml(paragraphText)}</p>\n`;
      }
    });

    // Обработать эпиграфы
    const epigraphs = section?.epigraph || [];
    epigraphs.forEach((epigraph: any) => {
      const epigraphText = this.extractTextFromFB2Element(epigraph);
      if (epigraphText.trim()) {
        content += `<blockquote class="epigraph">${this.escapeHtml(epigraphText)}</blockquote>\n`;
      }
    });

    // Обработать стихи/поэмы
    const poems = section?.poem || [];
    poems.forEach((poem: any) => {
      content += '<div class="poem">';
      const stanzas = poem?.stanza || [];
      stanzas.forEach((stanza: any) => {
        content += '<div class="stanza">';
        const verses = stanza?.v || [];
        verses.forEach((verse: any) => {
          const verseText = this.extractTextFromFB2Element(verse);
          if (verseText.trim()) {
            content += `<p class="verse">${this.escapeHtml(verseText)}</p>`;
          }
        });
        content += '</div>';
      });
      content += '</div>\n';
    });

    // Рекурсивно обработать подсекции
    const subsections = section?.section || [];
    subsections.forEach((subsection: any) => {
      content += this.extractSectionContent(subsection);
    });

    return content;
  }

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