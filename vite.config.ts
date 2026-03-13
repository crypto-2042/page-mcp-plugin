import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, cpSync } from 'fs';
import { defineConfig, type PluginOption, type UserConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = resolve(__dirname, 'dist');
const isWatch = process.argv.includes('--watch');
const buildTarget = process.env.BUILD_TARGET ?? 'main';

function extensionPostBuildPlugin(): PluginOption {
  return {
    name: 'extension-post-build',
    apply: 'build',
    closeBundle() {
      // 1. Manifest
      const manifest = JSON.parse(readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'));
      writeFileSync(resolve(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

      // 2. Flatten options/popup html into extension root
      const optionsHtml = resolve(distDir, 'options/index.html');
      if (existsSync(optionsHtml)) {
        let content = readFileSync(optionsHtml, 'utf-8');
        content = content.replace(/"\.\.\//g, '"./');
        writeFileSync(resolve(distDir, 'options.html'), content);
      }

      const popupHtml = resolve(distDir, 'popup/index.html');
      if (existsSync(popupHtml)) {
        let content = readFileSync(popupHtml, 'utf-8');
        content = content.replace(/"\.\.\//g, '"./');
        writeFileSync(resolve(distDir, 'popup.html'), content);
      }

      const mcpSkillsHtml = resolve(distDir, 'options/options-mcp-skills.html');
      if (existsSync(mcpSkillsHtml)) {
        let content = readFileSync(mcpSkillsHtml, 'utf-8');
        content = content.replace(/"\.\.\//g, '"./');
        writeFileSync(resolve(distDir, 'options-mcp-skills.html'), content);
      }

      // 3. Icons
      const assetsDir = resolve(distDir, 'assets');
      if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });
      ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'].forEach((file) => {
        const src = resolve(__dirname, 'src/assets', file);
        if (existsSync(src)) copyFileSync(src, resolve(assetsDir, file));
      });

      // 4. Locales
      const localesDir = resolve(__dirname, '_locales');
      if (existsSync(localesDir)) {
        cpSync(localesDir, resolve(distDir, '_locales'), { recursive: true });
      }
    },
  };
}

const commonBuild = {
  outDir: distDir,
  sourcemap: isWatch,
  minify: !isWatch,
} as const;

const sharedRoot = resolve(__dirname, 'src');

const mainConfig: UserConfig = {
  plugins: [tailwindcss(), react()],
  root: sharedRoot,
  base: './',
  build: {
    ...commonBuild,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        options: resolve(__dirname, 'src/options/index.html'),
        'options-mcp-skills': resolve(__dirname, 'src/options/options-mcp-skills.html'),
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
};

const contentConfig: UserConfig = {
  plugins: [react()],
  root: sharedRoot,
  build: {
    ...commonBuild,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content/index.tsx'),
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
      },
    },
  },
};

const bridgeConfig: UserConfig = {
  plugins: [extensionPostBuildPlugin()],
  root: sharedRoot,
  build: {
    ...commonBuild,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        bridge: resolve(__dirname, 'src/content/bridge.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: '[name].js',
      },
    },
  },
};

export default defineConfig(() => {
  if (buildTarget === 'content') return contentConfig;
  if (buildTarget === 'bridge') return bridgeConfig;
  return mainConfig;
});
