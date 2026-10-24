export default function MiniTrend({ values, color }: { values: (number | null)[]; color: string }) {
  const data = values.map((v, i) => (v === null ? null : { v, i })).filter((v) => v !== null);
  if (!data.length) return <div className="trend-placeholder" />;
  const x = (i: number) => (data.length < 2 ? 140 : 4 + (i / Math.max(1, values.length - 1)) * 154);
  const y = (v: number) => 52 - ((Math.min(100, Math.max(20, v)) - 20) / 80) * 44;
  const d = data
    .map((p, i) => `${i && data[i - 1]?.i === p.i - 1 ? 'L' : 'M'}${x(p.i)},${y(p.v)}`)
    .join(' ');
  const last = data.at(-1);
  return (
    <svg className="mini-trend" viewBox="0 0 162 58" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && <circle cx={x(last.i)} cy={y(last.v)} r="3.5" fill={color} />}
    </svg>
  );
}
