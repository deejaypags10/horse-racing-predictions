// In-house 20px line icons (DESIGN 3.2): a program, a ticket stub, a calibration diagonal.
interface P { size?: number; className?: string }

export function IconProgram({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={className}>
      <rect x="3.5" y="2.5" width="13" height="15" />
      <path d="M6 6.5h8M6 9.5h8M6 12.5h5" />
    </svg>
  );
}

export function IconTicket({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={className}>
      <path d="M2.5 5.5h15v3a1.5 1.5 0 0 0 0 3v3h-15v-3a1.5 1.5 0 0 0 0-3z" />
      <path d="M7.5 5.5v9" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

export function IconDiagonal({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={className}>
      <path d="M3 2.5v14.5h14.5" />
      <path d="M5 15L16 4" strokeDasharray="2 2" />
      <circle cx="8" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconGear({ size = 20, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={className}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" />
    </svg>
  );
}

export function IconStar({ filled, size = 16 }: P & { filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
      <path d="M8 1.8l1.85 3.95 4.3.5-3.2 2.95.85 4.25L8 11.3l-3.8 2.15.85-4.25L1.85 6.25l4.3-.5z" />
    </svg>
  );
}

export function IconChevron({ dir = 'right', size = 14 }: P & { dir?: 'left' | 'right' | 'down' | 'up' }) {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M5 2.5L9.5 7 5 11.5" />
    </svg>
  );
}
