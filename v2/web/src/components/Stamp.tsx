export function Stamp({ children, tone = 'ink' }: { children: string; tone?: 'ink' | 'live' }) {
  return <span className={`stamp stamp-${tone}`}>{children}</span>;
}
