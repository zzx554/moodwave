import puppeteer from 'puppeteer-core'

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

const header = await page.evaluate(() => ({
  nav: [...document.querySelectorAll('.site-nav button')].map((b) => b.innerText.trim()),
  chip: document.querySelector('.method-chip')?.innerText.trim() || null,
  hasAlgorithm: Boolean(document.querySelector('#algorithm')),
}))

// 小标展开
await clickText('算法说明')
await new Promise((r) => setTimeout(r, 900))
const opened = await page.evaluate(() => ({
  hasAlgorithm: Boolean(document.querySelector('#algorithm')),
  collapse: document.querySelector('.algorithm-collapse')?.innerText.trim() || null,
  scrollY: Math.round(window.scrollY),
}))
await page.screenshot({ path: '.verify/algorithm-chip.png' })

await clickText('收起算法说明')
await new Promise((r) => setTimeout(r, 900))
const closed = await page.evaluate(() => ({
  hasAlgorithm: Boolean(document.querySelector('#algorithm')),
}))

// 识别后看推荐
await clickText('上传图片')
await new Promise((r) => setTimeout(r, 400))
await clickText('使用示例人像')
await page.waitForFunction(() => document.body.innerText.includes('DETECTED EMOTION'), {
  timeout: 40000,
})
await new Promise((r) => setTimeout(r, 800))
await page.evaluate(() => window.scrollTo(0, document.querySelector('#recommend').offsetTop))
await new Promise((r) => setTimeout(r, 400))

const readDeck = () =>
  page.evaluate(() => ({
    emotion: document.querySelector('.context-emotion strong')?.innerText.trim() || null,
    libraryCount: document.querySelector('.library-tabs button span')?.innerText.trim() || null,
    featured: document.querySelector('.featured-track h3')?.innerText.trim() || null,
    rows: [...document.querySelectorAll('.track-row h4')].map((el) => el.innerText.trim()),
    scores: [
      document.querySelector('.score-number')?.innerText.trim(),
      ...[...document.querySelectorAll('.row-score strong')].map((el) => el.innerText.trim()),
    ],
  }))

const resonate = await readDeck()
await page.click('.library-actions .refresh-chip')
await new Promise((r) => setTimeout(r, 500))
const refreshed = await readDeck()
await clickText('共鸣优先')
await new Promise((r) => setTimeout(r, 500))
const resonance = await readDeck()

await page.evaluate(() => window.scrollTo(0, document.querySelector('#recommend').offsetTop))
await new Promise((r) => setTimeout(r, 400))
await page.screenshot({ path: '.verify/recommend-list.png' })

console.log(JSON.stringify({ errors, header, opened, closed, resonate, refreshed, resonance }, null, 2))
await browser.close()
