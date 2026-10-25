import { Fan } from 'lucide-react';
import type { CSSProperties } from 'react';
export function FanIcon({ spin = false, style }: { spin?: boolean; style?: CSSProperties }) {
  return (
    <Fan
      aria-hidden="true"
      className={spin ? 'fan-icon fan-icon-spinning' : 'fan-icon'}
      style={style}
    />
  );
}
