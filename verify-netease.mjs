import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 1000 })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 900))

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

// 先识别出情绪
await clickText('上传图片')
await new Promise((r) => setTimeout(r, 400))
await clickText('使用示例人像')
await page.waitForFunction(() => document.body.innerText.includes('DETECTED EMOTION'), { timeout: 40000 })
await new Promise((r) => setTimeout(r, 800))
await page.evaluate(() => window.scrollTo(0, document.querySelector('#recommend').offsetTop))
await new Promise((r) => setTimeout(r, 300))

const readDeck = () =>
  page.evaluate(() => ({
    activeTab: document.querySelector('.library-tabs button.active')?.innerText.replace(/\s+/g, ' ').trim() || null,
    note: document.querySelector('.library-note')?.innerText.replace(/\s+/g, ' ').trim() || null,
    notice: document.querySelector('.source-notice')?.innerText.replace(/\s+/g, ' ').trim() || null,
    error: document.querySelector('.online-error h3')?.innerText.trim() || null,
    featured: document.querySelector('.featured-track h3')?.innerText.trim() || null,
    featuredMeta: document.querySelector('.featured-track .track-topline')?.innerText.replace(/\s+/g, ' ').trim() || null,
    rows: [...document.querySelectorAll('.track-row h4')].map((el) => el.innerText.trim()),
    scores: [
      document.querySelector('.score-number')?.innerText.trim(),
      ...[...document.querySelectorAll('.row-score strong')].map((el) => el.innerText.trim()),
    ],
    player: document.querySelector('.player-source')?.innerText.trim() || null,
  }))

// ---- 场景一：网易云可用 ----
await clickText('网易云音乐')
await page.waitForFunction(
  () => Boolean(document.querySelector('.featured-track h3')) || Boolean(document.querySelector('.online-error')),
  { timeout: 30000 }
)
await new Promise((r) => setTimeout(r, 600))
const neteaseDeck = await readDeck()

// 播放首推
await page.click('.featured-track .play-button')
await new Promise((r) => setTimeout(r, 3500))
const playback = await page.evaluate(() => {
  const audio = document.querySelector('audio')
  return {
    src: audio?.currentSrc || audio?.src || null,
    readyState: audio?.readyState ?? null,
    currentTime: Math.round((audio?.currentTime || 0) * 10) / 10,
    paused: audio?.paused ?? null,
    error: audio?.error?.code ?? null,
    playerTitle: document.querySelector('.player-copy h4')?.innerText.trim() || null,
    playerSource: document.querySelector('.player-source')?.innerText.trim() || null,
  }
})
await page.screenshot({ path: '.verify/netease-list.png' })

// 换一批
await page.click('.library-actions .refresh-chip')
await page.waitForFunction(
  () => !document.querySelector('.track-loading') && Boolean(document.querySelector('.featured-track h3')),
  { timeout: 30000 }
)
await new Promise((r) => setTimeout(r, 500))
const refreshed = await readDeck()

// ---- 场景二：网易云不可达 -> 回退 iTunes ----
const fallbackPage = await browser.newPage()
await fallbackPage.setViewport({ width: 1440, height: 1000 })
const fallbackErrors = []
fallbackPage.on('pageerror', (e) => fallbackErrors.push(e.message))
await fallbackPage.setRequestInterception(true)
fallbackPage.on('request', (req) => {
  if (req.url().includes('/api/netease')) return req.respond({ status: 502, body: 'bad gateway' })
  return req.continue()
})
await fallbackPage.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
const clickFallback = async (text) => {
  await fallbackPage.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.replace(/\s+/g, ' ').includes(t)
    )
    btn?.click()
  }, text)
}
await clickFallback('上传图片')
await new Promise((r) => setTimeout(r, 400))
await clickFallback('使用示例人像')
await fallbackPage.waitForFunction(() => document.body.innerText.includes('DETECTED EMOTION'), { timeout: 40000 })
await new Promise((r) => setTimeout(r, 600))
await fallbackPage.evaluate(() => window.scrollTo(0, document.querySelector('#recommend').offsetTop))
await new Promise((r) => setTimeout(r, 300))
await clickFallback('网易云音乐')
await new Promise((r) => setTimeout(r, 2500))
const fallback = await fallbackPage.evaluate(() => ({
  activeTab: document.querySelector('.library-tabs button.active')?.innerText.replace(/\s+/g, ' ').trim() || null,
  notice: document.querySelector('.source-notice')?.innerText.replace(/\s+/g, ' ').trim() || null,
}))
await fallbackPage.screenshot({ path: '.verify/netease-fallback.png' })

console.log(
  JSON.stringify({ errors, neteaseDeck, playback, refreshed, fallback, fallbackErrors }, null, 2)
)
await browser.close()
