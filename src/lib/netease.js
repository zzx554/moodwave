import { clamp01 } from '../data/emotions.js'
import { QUERY_BANK } from '../data/neteaseQueries.js'
import snapshot from '../data/netease-snapshot.json'
import { getRecommendationTarget, scoreTrack } from './recommender.js'

const STRATEGY_LABEL = {
  resonate: '共鸣向',
  regulate: '调节向',
}

const MOOD_LABEL = {
  happy: '轻快 / 明亮',
  neutral: '舒缓 / 留白',
  surprised: '新鲜 / 节奏',
  sad: '温柔 / 陪伴',
  angry: '释放 / 降温',
  fearful: '安全 / 安定',
  disgusted: '清新 / 透气',
}

const cache = new Map()
const CACHE_TTL = 10 * 60 * 1000

function hashString(value) {
  // FNV-1a，让歌曲 id 的每一位都参与，得到稳定的伪随机数
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 100000) / 100000
}

export function getNeteaseQueryMeta(emotion, strategy, variant = 0) {
  const bank = QUERY_BANK[emotion]?.[strategy] ?? QUERY_BANK.neutral.regulate
  return {
    query: bank[variant % bank.length],
    label: MOOD_LABEL[emotion] ?? '氛围 / 融合',
    strategyLabel: STRATEGY_LABEL[strategy] ?? STRATEGY_LABEL.regulate,
  }
}

export function getNeteaseVariantCount(emotion, strategy) {
  return (QUERY_BANK[emotion]?.[strategy] ?? QUERY_BANK.neutral.regulate).length
}

// 网易云旧版检索接口不返回封面地址，按歌曲 id 生成确定性的渐变封面
function buildCover(id, index) {
  const seed = hashString(String(id))
  const hue = Math.round(seed * 360)
  const accentHue = (hue + 36 + Math.round(seed * 80)) % 360
  return {
    background: `radial-gradient(circle at ${18 + Math.round(seed * 52)}% 20%, hsl(${accentHue} 74% 56% / 0.5) 0, transparent 44%), linear-gradient(145deg, hsl(${hue} 34% 26%), hsl(${(hue + 26) % 360} 28% 9%) 78%)`,
    ink: '#f1f5ff',
    mark: String(index + 1).padStart(2, '0'),
  }
}

function buildNeteaseTrack(raw, index, emotion, strategy, total) {
  const target = getRecommendationTarget(emotion, strategy)
  const seed = hashString(String(raw.id))
  const seedTwo = hashString(`${raw.id}-energy`)
  // 检索结果缺少流派元数据：用歌曲 id 生成稳定、可复现的效价/能量先验，
  // 再与目标情绪做 45% 融合，保证同一首歌每次评估一致，不同歌曲之间有区分度
  const valence = Math.min(0.9, Math.max(-0.85, target.valence * 0.45 + (seed - 0.5) * 1.1))
  const energy = clamp01(target.energy * 0.45 + 0.275 + (seedTwo - 0.5) * 1)
  const rankFit = 1 - index / Math.max(total, 1)
  const seconds = Math.round((Number(raw.duration) || 0) / 1000)
  const album =
    raw.album?.name || (typeof raw.album === 'string' ? raw.album : '') || '网易云音乐'
  const artist = raw.artists
    ? (raw.artists || []).map((item) => item.name).filter(Boolean).join(' / ')
    : raw.artist || '未知艺人'

  return {
    id: `netease-${raw.id}`,
    title: raw.name || '未知曲目',
    artist,
    album,
    source: 'netease',
    // 开发环境经本地代理取流；静态部署（GitHub Pages）直接使用网易云外链，
    // 外链会 302 到 CDN，音频元素不受跨域限制
    src: import.meta.env.DEV
      ? `/api/nm-play/song/media/outer/url?id=${raw.id}.mp3`
      : `https://music.163.com/song/media/outer/url?id=${raw.id}.mp3`,
    songId: String(raw.id),
    genre: '网易云曲库',
    moods: [emotion],
    tags: [album, seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '在线'],
    valence: Number(valence.toFixed(3)),
    energy: Number(energy.toFixed(3)),
    popularity: Number((0.42 + rankFit * 0.5).toFixed(3)),
    externalUrl: `https://music.163.com/song?id=${raw.id}`,
    preview: true,
    cover: buildCover(raw.id, index),
  }
}

function finalizeTracks(rawList, emotion, strategy) {
  const seen = new Set()
  const filtered = rawList.filter((item) => {
    if (!item.id || !item.name) return false
    // fee=1 为会员歌曲，外链播放通常会被拦成 404，直接排除
    if (item.fee === 1) return false
    if (Number(item.duration) < 45000) return false
    const artistText = item.artists
      ? item.artists.map((a) => a.name).join('/')
      : item.artist || ''
    const signature = `${item.name}-${artistText}`.toLowerCase()
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })

  if (!filtered.length) return []

  const scored = filtered
    .map((raw, index) => buildNeteaseTrack(raw, index, emotion, strategy, filtered.length))
    .map((track) => scoreTrack(track, emotion, strategy))
    .sort((a, b) => b.score - a.score)
  const artistCount = new Map()
  const tracks = []

  for (const track of scored) {
    const count = artistCount.get(track.artist) ?? 0
    if (count >= 2) continue
    artistCount.set(track.artist, count + 1)
    tracks.push(track)
    if (tracks.length >= 12) break
  }
  return tracks
}

// 静态快照分组：优先当前变体，取不到时依次尝试其他关键词变体
function snapshotGroup(emotion, strategy, variant) {
  const total = getNeteaseVariantCount(emotion, strategy)
  for (let step = 0; step < total; step += 1) {
    const index = ((((variant % total) + step) % total) + total) % total
    const list = snapshot.groups?.[`${emotion}-${strategy}-${index}`]
    if (list?.length) return list
  }
  return []
}

export async function fetchNeteaseTracks({ emotion, strategy, variant = 0, signal }) {
  const key = `${emotion}-${strategy}-${variant}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.tracks
  }

  let tracks = []

  if (import.meta.env.DEV) {
    // 开发环境走本地代理实时检索，代理不可用时回退到构建时快照
    const { query } = getNeteaseQueryMeta(emotion, strategy, variant)
    const params = new URLSearchParams({ s: query, type: '1', offset: '0', limit: '30' })
    try {
      const response = await fetch(`/api/netease/search/get/web?${params.toString()}`, { signal })
      if (!response.ok) throw new Error(`网易云曲库响应异常（HTTP ${response.status}）`)
      const data = await response.json()
      tracks = finalizeTracks(data?.result?.songs || [], emotion, strategy)
    } catch (error) {
      if (error?.name === 'AbortError') throw error
    }
  }

  // 生产构建（GitHub Pages）没有检索代理，直接读取构建时同步的曲库快照
  if (!tracks.length) {
    tracks = finalizeTracks(snapshotGroup(emotion, strategy, variant), emotion, strategy)
  }

  if (!tracks.length) {
    throw new Error('网易云曲库暂时没有检索到可推荐歌曲')
  }

  cache.set(key, { time: Date.now(), tracks })
  return tracks
}
