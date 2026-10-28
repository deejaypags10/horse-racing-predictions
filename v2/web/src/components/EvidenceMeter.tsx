import type { Evidence } from '../api/types';
import { EVIDENCE_LEVEL, EVIDENCE_MAX, EVIDENCE_NAME, evidenceTooltip } from '../domain/evidence';

export function EvidenceMeter({ evidence, starts, showName = false }: { evidence: Evidence; starts?: number | null; showName?: boolean }) {
  const level = EVIDENCE_LEVEL[evidence];
  const tip = evidenceTooltip(evidence, starts);
  return (
    <span className={`evid evid-${evidence}`} title={tip}>
      <svg width="18" height="12" viewBox="0 0 18 12" role="img" aria-label={`Evidence: ${EVIDENCE_NAME[evidence]}, ${level} of ${EVIDENCE_MAX}`}>
        {Array.from({ length: EVIDENCE_MAX }, (_, i) => {
          const h = 6 + i * 3;
          const filled = i < level;
          return (
            <rect
              key={i}
              x={i * 6 + 0.5}
              y={12 - h + 0.5}
              width={4}
              height={h - 1}
              className={filled ? 'evid-on' : 'evid-off'}
            />
          );
        })}
      </svg>
      {level <= 1 && <sup className="evid-q" aria-hidden="true">?</sup>}
      {showName && <span className="evid-name">{EVIDENCE_NAME[evidence]}</span>}
    </span>
  );
}
