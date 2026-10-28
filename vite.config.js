import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 网易云接口不支持浏览器跨域，统一经本地代理转发；
// 播放接口是 302 跳转到 CDN，需要开启 followRedirects 让代理继续取流
const musicHeaders = {
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
}

const neteaseProxy = {
  '/api/nm-play': {
    target: 'https://music.163.com',
    changeOrigin: true,
    secure: false,
    timeout: 15000,
    proxyTimeout: 15000,
    followRedirects: true,
    rewrite: (path) => path.replace(/^\/api\/nm-play/, ''),
    headers: musicHeaders,
  },
  '/api/netease': {
    target: 'https://music.163.com',
    changeOrigin: true,
    secure: false,
    timeout: 10000,
    proxyTimeout: 10000,
    rewrite: (path) => path.replace(/^\/api\/netease/, '/api'),
    headers: musicHeaders,
  },
}

export default defineConfig({
  // 相对路径产物，兼容 GitHub Pages 的 /<repo>/ 子路径部署
  base: './',
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: neteaseProxy,
    watch: {
      // 音频文件较大，写入过程中会触发 EBUSY，交给 public 静态目录处理即可
      ignored: ['**/public/music/**', '**/dist/**'],
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    proxy: neteaseProxy,
  },
})
