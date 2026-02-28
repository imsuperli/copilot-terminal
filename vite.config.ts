import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'fs';

// 读取 package.json 版本号
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
);

export default defineConfig({
  plugins: [react()],

  root: path.join(__dirname, 'src/renderer'),

  // 开发服务器配置
  server: {
    port: 5173,
    strictPort: true, // 端口被占用时报错而非自动切换
  },

  // 构建配置
  build: {
    outDir: path.join(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },

  // Electron 环境适配
  base: './', // 使用相对路径,适配 file:// 协议

  // 注入环境变量
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
});
