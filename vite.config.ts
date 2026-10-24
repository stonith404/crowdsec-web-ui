import { createHash } from 'crypto';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function dropFontsourceWoffFallback(): Plugin {
  return {
    name: 'drop-fontsource-woff-fallback',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/@fontsource/') || !/\.css(?:$|\?)/.test(id)) return null;
      return { code: code.replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, ''), map: null };
    },
  };
}


// Sets the dark class before the first paint, so dark mode never flashes light
// The server's CSP blocks inline scripts, so the build ships it as a file in assets/
const THEME_INIT_SCRIPT = "(function(){try{var m=localStorage.getItem('theme');var d=m==='dark'||(m!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.dataset.mode=d?'dark':'light'}catch(e){}})();";

function themeInit(): Plugin {
  const fileName = `assets/theme-init-${createHash('sha256').update(THEME_INIT_SCRIPT).digest('hex').slice(0, 8)}.js`;
  let isBuild = false;
  return {
    name: 'theme-init',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName, source: THEME_INIT_SCRIPT });
    },
    transformIndexHtml() {
      return [isBuild
        ? { tag: 'script', attrs: { src: `./${fileName}` }, injectTo: 'head' }
        : { tag: 'script', children: THEME_INIT_SCRIPT, injectTo: 'head' }];
    },
  };
}

export default defineConfig({
  root: 'client',
  base: './',
  define: {
    'import.meta.env.VITE_BUILD_DATE': JSON.stringify(
      process.env.VITE_BUILD_DATE || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12),
    ),
  },
  plugins: [dropFontsourceWoffFallback(), themeInit(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'client/src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/client'),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }
          if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
            return 'i18n-vendor';
          }
          if (id.includes('/@phosphor-icons/')) {
            return 'icons-vendor';
          }
          if (id.includes('/@cloudflare/kumo/') || id.includes('/@base-ui/')) {
            return 'kumo-vendor';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.BACKEND_URL || 'http://localhost:3000',
        changeOrigin: true,
        xfwd: true,
        ws: true,
      },
    },
  },
});
