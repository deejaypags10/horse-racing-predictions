import type { CSSProperties } from 'react';
import type { Breed } from '../api/types';
import { clothColors } from '../domain/saddlecloths';

interface Props {
  program: string;
  breed?: Breed;
  size?: 'sm' | 'md' | 'lg' | 'xs';
  scratched?: boolean;
  /** Override (international cards): colours as sent by the source. */
  sourceColors?: { bg: string | null; fg: string | null };
  label?: boolean;
}

export function Cloth({ program, breed, size = 'md', scratched, sourceColors, label = true }: Props) {
  let { bg, fg } = clothColors(program, breed);
  if (!bg && breed === 'other' && sourceColors?.bg && sourceColors.fg) {
    bg = sourceColors.bg;
    fg = sourceColors.fg;
  }
  const style = bg && fg ? ({ '--cloth-bg': bg, '--cloth-fg': fg } as CSSProperties) : undefined;
  const m = /^(\d+)([A-Z]*)$/i.exec(program);
  return (
    <span
      className={`cloth cloth-${size}${bg ? '' : ' cloth-neutral'}${scratched ? ' is-scratched' : ''}`}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label ? `Number ${program}${scratched ? ', scratched' : ''}` : undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="cloth-num" aria-hidden="true">
        {m ? <>{m[1]}{m[2] && <span className="cloth-suffix">{m[2]}</span>}</> : program}
      </span>
    </span>
  );
}
