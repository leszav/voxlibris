export function ReadingDreamIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Open Book */}
      <path
        d="M40 140C40 140 60 130 100 140C140 130 160 140 160 140V60C160 60 140 50 100 60C60 50 40 60 40 60V140Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M100 60V140" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      
      {/* Pages */}
      <path d="M45 135C45 135 65 125 100 135" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <path d="M155 135C155 135 135 125 100 135" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <path d="M45 130C45 130 65 120 100 130" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      <path d="M155 130C155 130 135 120 100 130" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
      
      {/* Dream/Cloud elements rising from book */}
      <circle cx="80" cy="50" r="10" fill="currentColor" fillOpacity="0.2" />
      <circle cx="120" cy="40" r="15" fill="currentColor" fillOpacity="0.15" />
      <circle cx="100" cy="20" r="8" fill="currentColor" fillOpacity="0.1" />
      <circle cx="140" cy="60" r="12" fill="currentColor" fillOpacity="0.1" />
      <circle cx="60" cy="70" r="8" fill="currentColor" fillOpacity="0.1" />
      
      {/* Stars */}
      <path d="M50 30L52 35L57 37L52 39L50 44L48 39L43 37L48 35L50 30Z" fill="currentColor" fillOpacity="0.4" />
      <path d="M150 30L152 35L157 37L152 39L150 44L148 39L143 37L148 35L150 30Z" fill="currentColor" fillOpacity="0.4" />
      <path d="M100 10L101 12L103 13L101 14L100 16L99 14L97 13L99 12L100 10Z" fill="currentColor" fillOpacity="0.6" />
    </svg>
  );
}
