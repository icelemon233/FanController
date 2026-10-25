export function WindowGlyph({ kind }: { kind: 'minimize' | 'maximize' | 'restore' | 'close' }) {
  return <span className={`window-glyph window-glyph-${kind}`} aria-hidden="true" />;
}
