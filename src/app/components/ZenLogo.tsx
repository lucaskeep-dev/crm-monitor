export default function ZenLogo({ className = 'w-8 h-8', showGlow = true }: { className?: string; showGlow?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Zen Seguros"
    >
      <defs>
        <linearGradient id="zen-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        {showGlow && (
          <filter id="zen-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      <g fill="url(#zen-grad)" filter={showGlow ? 'url(#zen-glow)' : undefined}>
        {/* Barra superior (paralelogramo com ponta angular) */}
        <path d="M6 10 L50 10 L58 18 L14 18 Z" />
        {/* Diagonal central */}
        <path d="M44 18 L58 18 L20 46 L6 46 Z" />
        {/* Barra inferior (paralelogramo com ponta angular) */}
        <path d="M14 46 L58 46 L50 54 L6 54 Z" />
      </g>
    </svg>
  );
}
