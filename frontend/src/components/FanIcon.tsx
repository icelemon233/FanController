import Icon from '@ant-design/icons';
import type { CSSProperties, SVGProps } from 'react';

function FanGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      {[0, 90, 180, 270].map((a) => (
        <path
          key={a}
          transform={`rotate(${a} 12 12)`}
          d="M12 10C8 8 7 4.5 9.3 3.4c2.7-1.4 5.1.5 4.8 3-.1 1.4-.8 2.6-2.1 3.6Z"
        />
      ))}
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}
export function FanIcon({ spin = false, style }: { spin?: boolean; style?: CSSProperties }) {
  return <Icon component={FanGlyph} spin={spin} style={style} />;
}
