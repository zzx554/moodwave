import puppeteer from 'puppeteer-core'
import { mkdir } from 'node:fs/promises'

await mkdir('.verify', { recursive: true })
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 1200))

const clickText = async (text) => {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.replace(/\s+/g, ' ').includes(t)
    )
    if (!btn) return false
    btn.click()
    return true
  }, text)
  if (!ok) throw new Error('missing: ' + text)
}

const readResult = () =>
  page.evaluate(() => ({
    method: document.querySelector('.method-badge')?.innerText || 'face',
    emotion: document.querySelector('.emotion-name h3')?.innerText || null,
    valence: document.querySelectorAll('.affect-head strong')[0]?.innerText || null,
    energy: document.querySelectorAll('.affect-head strong')[1]?.innerText || null,
    palette: [...document.querySelectorAll('.scene-swatch')].map((el) => el.style.background),
    panelStatus: document.querySelector('.live-status')?.innerText || null,
  }))

const feed = async (drawSrc, name, type) => {
  // 先清空画面，让结果面板回到「等待识别」，避免连续两张同情绪时无法判断是否已更新
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes('清除画面')
    )
    if (btn) btn.click()
  })
  await new Promise((r) => setTimeout(r, 600))
  await page.evaluate(
    async ({ drawSrc, name, type }) => {
      const c = document.createElement('canvas')
      c.width = 900
      c.height = 900
      const ctx = c.getContext('2d')
      const draw = new Function('ctx', 'canvas', 'return (' + drawSrc + ')(ctx, canvas)')
      draw(ctx, c)
      const blob = await new Promise((res) => c.toBlob(res, type, 0.92))
      const input = document.querySelector('input[type="file"]')
      const dt = new DataTransfer()
      dt.items.add(new File([blob], name, { type }))
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { drawSrc: drawSrc.toString(), name, type }
  )
  await page.waitForFunction(
    () => {
      const emotion = document.querySelector('.emotion-name h3')?.innerText || ''
      const state = document.querySelector('.live-status')?.innerText || ''
      return Boolean(emotion) && !emotion.includes('等待') && !state.includes('分析中')
    },
    { timeout: 40000 }
  )
  await new Promise((r) => setTimeout(r, 400))
  return readResult()
}

await clickText('上传图片')
await new Promise((r) => setTimeout(r, 300))

// 1) 透明底黄色笑脸（表情包典型情况）
const transparentSmiley = await feed(
  (ctx) => {
    ctx.clearRect(0, 0, 900, 900)
    ctx.fillStyle = '#f7d51d'
    ctx.beginPath()
    ctx.arc(450, 450, 330, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(340, 380, 62, 0, Math.PI * 2)
    ctx.arc(560, 380, 62, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#1b1b1b'
    ctx.lineWidth = 22
    ctx.beginPath()
    ctx.arc(450, 470, 180, 0.12 * Math.PI, 0.88 * Math.PI)
    ctx.stroke()
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.arc(450, 400, 330, 0, Math.PI * 2)
    ctx.stroke()
  },
  'sticker-transparent-smiley.png',
  'image/png'
)
await page.screenshot({ path: '.verify/sticker-transparent.png' })

// 2) 白底红色愤怒表情
const whiteRed = await feed(
  (ctx) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 900, 900)
    ctx.fillStyle = '#d92b21'
    ctx.beginPath()
    ctx.arc(450, 450, 300, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#5c0f0a'
    ctx.lineWidth = 26
    ctx.beginPath()
    ctx.moveTo(300, 320)
    ctx.lineTo(410, 380)
    ctx.moveTo(600, 320)
    ctx.lineTo(490, 380)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(450, 640, 150, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
  },
  'sticker-white-red.png',
  'image/png'
)
await page.screenshot({ path: '.verify/sticker-white-red.png' })

// 3) 白底蓝色悲伤表情
const whiteBlue = await feed(
  (ctx) => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 900, 900)
    ctx.fillStyle = '#2f6fd0'
    ctx.beginPath()
    ctx.arc(450, 450, 300, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(360, 400, 60, 0, Math.PI * 2)
    ctx.arc(540, 400, 60, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#0f2f63'
    ctx.lineWidth = 24
    ctx.beginPath()
    ctx.arc(450, 620, 140, Math.PI * 1.2, Math.PI * 1.8)
    ctx.stroke()
  },
  'sticker-white-blue.png',
  'image/png'
)
await page.screenshot({ path: '.verify/sticker-white-blue.png' })

// 4) 全屏蓝色渐变（回归）
const blue = await feed(
  (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 900, 900)
    g.addColorStop(0, '#0b1d3a')
    g.addColorStop(0.6, '#1d3f6e')
    g.addColorStop(1, '#31527f')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 900, 900)
  },
  'scene-blue.jpg',
  'image/jpeg'
)

// 5) 全屏红色爆炸（回归）
const red = await feed(
  (ctx) => {
    ctx.fillStyle = '#b8231c'
    ctx.fillRect(0, 0, 900, 900)
    for (let i = 0; i < 16; i += 1) {
      const angle = (i / 16) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(450, 450)
      ctx.lineTo(450 + Math.cos(angle) * 430, 450 + Math.sin(angle) * 430)
      ctx.lineWidth = 46
      ctx.strokeStyle = '#ee3b2f'
      ctx.stroke()
    }
  },
  'scene-red.jpg',
  'image/jpeg'
)

// 6) 真人示例图，确认面部链路未受影响
await clickText('清除画面')
await new Promise((r) => setTimeout(r, 500))
await clickText('使用示例人像')
await page.waitForFunction(() => document.body.innerText.includes('DETECTED EMOTION'), {
  timeout: 30000,
})
await new Promise((r) => setTimeout(r, 800))
const face = await readResult()

console.log(
  JSON.stringify({ errors, transparentSmiley, whiteRed, whiteBlue, blue, red, face }, null, 2)
)
await browser.close()
