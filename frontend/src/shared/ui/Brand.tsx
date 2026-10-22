export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={("dp-brand-mark " + className).trim()} viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="10" />
      <path d="M9.5 17.5 15 23 25 11" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={("dp-wordmark " + className).trim()}>
      Up<span className="dp-wordmark-grade">Grade</span>
      <svg className="dp-wordmark-tick" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 10.5 8 15 17 4" />
      </svg>
    </span>
  );
}
