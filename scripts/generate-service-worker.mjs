import { generateSW } from 'workbox-build'

const result = await generateSW({
  globDirectory: 'dist',

  globPatterns: [
    '**/*.{html,js,css,json,webmanifest,svg,png,jpg,jpeg,webp,ico,woff,woff2}',
  ],

  swDest: 'dist/sw.js',

  // 題庫目前約 1 MB／份，預留到單檔 5 MB。
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,

  // 多頁 Astro 網站不使用 SPA fallback。
  navigateFallback: null,

  // Service Worker 接管網站根目錄。
  navigationPreload: true,

  runtimeCaching: [
    {
      // 處理頁面導覽，例如 /mock、/wrong。
      urlPattern: ({ request }) => request.mode === 'navigate',
      handler: 'NetworkFirst',
      options: {
        cacheName: 'rent-manager-pages',
        networkTimeoutSeconds: 3,
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },
  ],
})

console.log(
  `Service Worker generated: ${result.count} files, ` +
    `${result.size} bytes precached`,
)

for (const warning of result.warnings) {
  console.warn(warning)
}