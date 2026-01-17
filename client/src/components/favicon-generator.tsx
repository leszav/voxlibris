/**
 * Генератор фавиконки для VoxLibris
 * Создает SVG-логотип в виде книги с аудио-волнами
 */
export function FaviconSVG() {
  return (
    <svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background circle */}
      <circle cx="128" cy="128" r="128" fill="#8B5CF6" />
      
      {/* Book */}
      <g transform="translate(64, 64)">
        {/* Left page */}
        <path
          d="M10 10 L10 108 C10 115 15 120 25 118 L60 110 L60 5 C50 7 15 10 10 10Z"
          fill="white"
          opacity="0.95"
        />
        
        {/* Right page */}
        <path
          d="M118 10 C113 10 78 7 68 5 L68 110 L103 118 C113 120 118 115 118 108 L118 10Z"
          fill="white"
          opacity="0.95"
        />
        
        {/* Book spine */}
        <rect x="60" y="5" width="8" height="113" fill="#E0E7FF" />
        
        {/* Audio waves */}
        <g transform="translate(64, 40)">
          {/* Center line */}
          <line x1="0" y1="20" x2="0" y2="40" stroke="#F59E0B" strokeWidth="4" strokeLinecap="round" />
          
          {/* Wave 1 */}
          <line x1="-12" y1="25" x2="-12" y2="35" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          <line x1="12" y1="25" x2="12" y2="35" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          
          {/* Wave 2 */}
          <line x1="-24" y1="28" x2="-24" y2="32" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="24" y1="28" x2="24" y2="32" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}

// Функция для генерации Data URL для фавиконки
export function generateFaviconDataURL(): string {
  const svg = `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="128" cy="128" r="128" fill="#8B5CF6"/>
    <g transform="translate(64, 64)">
      <path d="M10 10 L10 108 C10 115 15 120 25 118 L60 110 L60 5 C50 7 15 10 10 10Z" fill="white" opacity="0.95"/>
      <path d="M118 10 C113 10 78 7 68 5 L68 110 L103 118 C113 120 118 115 118 108 L118 10Z" fill="white" opacity="0.95"/>
      <rect x="60" y="5" width="8" height="113" fill="#E0E7FF"/>
      <g transform="translate(64, 40)">
        <line x1="0" y1="20" x2="0" y2="40" stroke="#F59E0B" stroke-width="4" stroke-linecap="round"/>
        <line x1="-12" y1="25" x2="-12" y2="35" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>
        <line x1="12" y1="25" x2="12" y2="35" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>
        <line x1="-24" y1="28" x2="-24" y2="32" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="24" y1="28" x2="24" y2="32" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`;
  
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
