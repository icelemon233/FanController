import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import version from '../version.json' with { type: 'json' };
export default defineConfig(({ command, mode }) => {
  const browserDemo = command === 'serve' || mode === 'demo';
  return {
    plugins: [
      react(),
      {
        name: 'fancon-build-contract',
        generateBundle(_options, bundle) {
          if (
            !browserDemo &&
            Object.values(bundle).some(
              (item) =>
                item.type === 'chunk' &&
                Object.keys(item.modules).some((id) => /\/demo(?:Gateway|Data)\.ts$/.test(id)),
            )
          ) {
            throw new Error('Desktop production builds must not include the browser demo adapter.');
          }
          this.emitFile({
            type: 'asset',
            fileName: 'build-info.json',
            source: JSON.stringify({
              version: version.version,
              target: browserDemo ? 'demo' : 'native',
            }),
          });
        },
      },
    ],
    define: { __FANCON_BROWSER_DEMO__: JSON.stringify(browserDemo) },
    base: './',
    build: { target: 'es2022', outDir: 'dist', sourcemap: false },
  };
});
