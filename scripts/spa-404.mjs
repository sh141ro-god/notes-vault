// SPA-фолбэк для статического хостинга (Cloudflare Pages и др.): копируем
// собранный index.html в 404.html. Тогда прямой заход/refresh на клиентский
// маршрут (/calendar, /notes/<id>) отдаёт приложение, а react-router разбирает
// URL сам. Это заменяет правило `/* /index.html 200` в _redirects, которое
// Cloudflare отвергает как «бесконечный цикл» (code 100324).
import { copyFileSync, existsSync } from 'node:fs'

const src = 'dist/index.html'
const dst = 'dist/404.html'
if (!existsSync(src)) {
  console.error(`[spa-404] ${src} не найден — сборка не создала index.html?`)
  process.exit(1)
}
copyFileSync(src, dst)
console.log(`[spa-404] ${src} → ${dst}`)
