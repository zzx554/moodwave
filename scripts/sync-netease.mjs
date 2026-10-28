// 构建前同步网易云曲库快照：GitHub Pages 是纯静态托管，无法运行检索代理，
// 这里把每个「情绪 × 策略 × 关键词变体」的检索结果落到本地 JSON，前端离线读取。
// 每首都校验外链是否可播（会员/版权受限歌曲会返回 404），只保留能播放的曲目。
import { readFile, writeFile } from 'node:fs/promises'
import { QUERY_BANK } from '../src/data/neteaseQueries.js'

const variantCount = (emotion, strategy) => QUERY_BANK[emotion]?.[strategy]?.length || 1

const SEARCH = 'https://music.163.com/api/search/get/web'
const LEGACY = 'https://music.163.com/api/search/get'
const CLOUD = 'https://music.163.com/api/cloudsearch/pc'
const OUTER = 'https://music.163.com/song/media/outer/url'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const MAX_PER_GROUP = 12
const CANDIDATES = 22

async function search(query) {
  const params = `s=${encodeURIComponent(query)}&type=1&offset=0&limit=${CANDIDATES}`
  // 网易云对不同检索路径分别限流，按顺序尝试直到拿到结果
  const endpoints = [
    { url: `${SEARCH}?${params}` },
    { url: `${LEGACY}?${params}` },
    {
      url: CLOUD,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      },
    },
  ]

  for (const endpoint of endpoints) {
    for (let round = 0; round < 2; round += 1) {
      try {
        const res = await fetch(endpoint.url, {
          ...(endpoint.init || {}),
          headers: {
            Referer: 'https://music.163.com/',
            'User-Agent': UA,
            ...(endpoint.init?.headers || {}),
          },
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) throw new Error(`search ${res.status}`)
        const data = await res.json()
        const songs = data?.result?.songs || []
        if (songs.length) return songs
        throw new Error('empty result')
      } catch (error) {
        if (round === 1) break
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
  }
  throw new Error('all search endpoints failed')
}

async function checkPlayable(id) {
  try {
    const res = await fetch(`${OUTER}?id=${id}.mp3`, {
      redirect: 'manual',
      headers: { Referer: 'https://music.163.com/', 'User-Agent': UA },
      signal: AbortSignal.timeout(12000),
    })
    const location = res.headers.get('location') || ''
    if (res.status !== 302 || !location.includes('.net')) return null
    const head = await fetch(location, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(12000),
    })
    const type = head.headers.get('content-type') || ''
    const size = Number(head.headers.get('content-length') || 0)
    await head.body?.cancel()
    return type.includes('audio') && (size === 0 || size > 200000)
  } catch {
    return null
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (cursor < items.length) {
        const index = cursor
        cursor += 1
        results[index] = await worker(items[index], index)
      }
    })
  )
  return results
}

const groups = {}
const stats = []
const cache = new Map()

// 已有快照中的分组直接复用，只补齐缺失或空的分组，避免重复请求
try {
  const existing = JSON.parse(
    await readFile(new URL('../src/data/netease-snapshot.json', import.meta.url), 'utf8')
  )
  for (const [key, tracks] of Object.entries(existing.groups || {})) {
    if (tracks.length) groups[key] = tracks
  }
} catch {
  // 首次同步没有快照文件
}

for (const emotion of Object.keys(QUERY_BANK)) {
  for (const strategy of Object.keys(QUERY_BANK[emotion])) {
    const variants = variantCount(emotion, strategy)
    for (let variant = 0; variant < variants; variant += 1) {
      const query = QUERY_BANK[emotion][strategy][variant]
      const key = `${emotion}-${strategy}-${variant}`
      if (groups[key]?.length) {
        console.log(`skip ${key} (cached)`)
        continue
      }
      await new Promise((r) => setTimeout(r, 2500))
      let songs = []
      try {
        songs = await search(query)
      } catch (error) {
        console.log(`search failed ${key}: ${error.message}`)
        continue
      }

      const pickable = songs
        .filter((song) => song.id && song.name && song.fee !== 1 && Number(song.duration) >= 45000)
        .slice(0, CANDIDATES)

      const checked = await mapLimit(pickable, 4, async (song) => {
        let playable = cache.get(song.id)
        if (playable === undefined) {
          playable = await checkPlayable(song.id)
          cache.set(song.id, playable)
        }
        if (!playable) return null
        return {
          id: String(song.id),
          name: song.name,
          artist: (song.artists || []).map((a) => a.name).filter(Boolean).join(' / ') || '未知艺人',
          album: song.album?.name || '网易云音乐',
          duration: Number(song.duration) || 0,
        }
      })

      const tracks = checked.filter(Boolean).slice(0, MAX_PER_GROUP)
      if (tracks.length) groups[key] = tracks
      stats.push(`${key}: ${tracks.length}/${pickable.length} 「${query}」`)
      console.log(stats.at(-1))
    }
  }
}

const payload = {
  syncedAt: new Date().toISOString().slice(0, 10),
  groups,
}
await writeFile(
  new URL('../src/data/netease-snapshot.json', import.meta.url),
  `${JSON.stringify(payload, null, 0)}\n`,
  'utf8'
)

const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0)
const bytes = Buffer.byteLength(JSON.stringify(payload))
console.log(`snapshot: ${Object.keys(groups).length} groups / ${total} tracks / ${(bytes / 1024).toFixed(0)} KB`)
