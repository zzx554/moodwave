import { EMOTIONS, clamp01 } from '../data/emotions.js'
import { getRecommendationTarget, scoreTrack } from './recommender.js'

const QUERY_BANK = {
  happy: {
    resonate: ['happy upbeat pop', 'feel good dance', 'sunny indie pop'],
    regulate: ['feel good acoustic', 'sunny folk', 'happy soft pop'],
  },
  neutral: {
    resonate: ['chill instrumental', 'downtempo electronic', 'quiet acoustic'],
    regulate: ['warm soul', 'gentle indie', 'soft jazz'],
  },
  surprised: {
    resonate: ['energetic electronic', 'bright pop', 'future bass'],
    regulate: ['mellow acoustic', 'dreamy indie', 'soft electronic'],
  },
  sad: {
    resonate: ['sad acoustic', 'melancholy piano', 'slow indie'],
    regulate: ['uplifting acoustic', 'comforting piano', 'hopeful indie'],
  },
  angry: {
    resonate: ['intense rock', 'high energy electronic', 'dark trap'],
    regulate: ['calm piano', 'ambient relaxation', 'soft acoustic'],
  },
  fearful: {
    resonate: ['dark ambient', 'cinematic tension', 'moody electronic'],
    regulate: ['soothing piano', 'safe ambient', 'gentle acoustic'],
  },
  disgusted: {
    resonate: ['gritty blues', 'raw alternative', 'industrial rock'],
    regulate: ['fresh indie pop', 'clean acoustic', 'light electronic'],
  },
}

const GENRE_PROFILES = {
  Pop: { valence: 0.55, energy: 0.65 },
  'Singer/Songwriter': { valence: 0.32, energy: 0.4 },
  Alternative: { valence: 0.18, energy: 0.57 },
  Rock: { valence: 0.28, energy: 0.76 },
  Electronic: { valence: 0.44, energy: 0.72 },
  'Hip-Hop/Rap': { valence: 0.28, energy: 0.7 },
  'R&B/Soul': { valence: 0.44, energy: 0.55 },
  Classical: { valence: 0.12, energy: 0.28 },
  Jazz: { valence: 0.34, energy: 0.44 },
  Soundtrack: { valence: 0.22, energy: 0.48 },
  Dance: { valence: 0.64, energy: 0.86 },
  Country: { valence: 0.42, energy: 0.55 },
  Folk: { valence: 0.3, energy: 0.4 },
  Metal: { valence: -0.12, energy: 0.92 },
  Blues: { valence: 0.18, energy: 0.45 },
  World: { valence: 0.4, energy: 0.56 },
  'Children’s Music': { valence: 0.76, energy: 0.6 },
  Vocal: { valence: 0.38, energy: 0.5 },
  'New Age': { valence: 0.3, energy: 0.24 },
  Latin: { valence: 0.62, energy: 0.72 },
  Reggae: { valence: 0.62, energy: 0.55 },
  Gospel: { valence: 0.58, energy: 0.5 },
  Anime: { valence: 0.45, energy: 0.62 },
  'Easy Listening': { valence: 0.34, energy: 0.3 },
  Enka: { valence: 0.16, energy: 0.4 },
}

const cache = new Map()
const CACHE_TTL = 10 * 60 * 1000

function hashString(value) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 9973
  }
  return hash / 9973
}

export function getQueryMeta(emotion, strategy, variant = 0) {
  const bank = QUERY_BANK[emotion]?.[strategy] ?? QUERY_BANK.neutral.regulate
  const query = bank[variant % bank.length]
  const labels = {
    happy: '轻快 / 明亮',
    neutral: '舒缓 / 留白',
    surprised: '新鲜 / 节奏',
    sad: '温柔 / 陪伴',
    angry: '释放 / 降温',
    fearful: '安全 / 安定',
    disgusted: '清新 / 透气',
  }
  return {
    query,
    label: labels[emotion] ?? '氛围 / 融合',
    strategyLabel: strategy === 'regulate' ? '调节向' : '共鸣向',
  }
}

export function getQueryVariantCount(emotion, strategy) {
  return (QUERY_BANK[emotion]?.[strategy] ?? QUERY_BANK.neutral.regulate).length
}

function buildOnlineTrack(raw, index, emotion, strategy, total) {
  const target = getRecommendationTarget(emotion, strategy)
  const profile = GENRE_PROFILES[raw.primaryGenreName] ?? { valence: 0.35, energy: 0.52 }
  const seed = hashString(String(raw.trackId ?? raw.trackName))
  const seedTwo = hashString(`${raw.trackId ?? raw.trackName}-energy`)
  const valence = Math.min(0.9, Math.max(-0.85, profile.valence * 0.64 + target.valence * 0.36 + (seed - 0.5) * 0.18))
  const energy = clamp01(profile.energy * 0.72 + target.energy * 0.28 + (seedTwo - 0.5) * 0.12)
  const rankFit = 1 - index / Math.max(total, 1)

  return {
    id: `itunes-${raw.trackId}`,
    title: raw.trackName,
    artist: raw.artistName,
    album: raw.collectionName || 'Apple Music Preview',
    source: 'online',
    src: raw.previewUrl,
    artwork: (raw.artworkUrl100 || '').replace('100x100bb', '300x300bb'),
    genre: raw.primaryGenreName || 'Music',
    moods: [emotion],
    tags: [raw.primaryGenreName || '音乐', '30 秒试听'],
    valence: Number(valence.toFixed(3)),
    energy: Number(energy.toFixed(3)),
    popularity: Number((0.42 + rankFit * 0.5).toFixed(3)),
    externalUrl: raw.trackViewUrl,
    preview: true,
  }
}

export async function fetchOnlineTracks({ emotion, strategy, variant = 0, signal }) {
  const key = `${emotion}-${strategy}-${variant}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.tracks
  }

  const { query } = getQueryMeta(emotion, strategy, variant)
  const params = new URLSearchParams({
    term: query,
    media: 'music',
    entity: 'song',
    limit: '30',
    country: 'us',
  })

  const response = await fetch(`https://itunes.apple.com/search?${params.toString()}`, { signal })
  if (!response.ok) {
    throw new Error(`在线曲库响应异常（HTTP ${response.status}）`)
  }

  const data = await response.json()
  const seen = new Set()
  const rawTracks = (data.results || []).filter((item) => {
    if (!item.previewUrl || !item.trackId) return false
    if (item.trackExplicitness === 'explicit') return false
    const signature = `${item.trackName}-${item.artistName}`.toLowerCase()
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })

  if (!rawTracks.length) {
    throw new Error('在线曲库暂时没有可试听结果')
  }

  const formatted = rawTracks.map((raw, index) =>
    buildOnlineTrack(raw, index, emotion, strategy, rawTracks.length)
  )
  const scored = formatted
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

  cache.set(key, { time: Date.now(), tracks })
  return tracks
}

export function getEmotionTargetDescription(emotion, strategy) {
  const target = getRecommendationTarget(emotion, strategy)
  const emotionMeta = EMOTIONS[emotion] ?? EMOTIONS.neutral
  return `${emotionMeta.label} · 目标效价 ${target.valence > 0 ? '+' : ''}${target.valence.toFixed(2)} / 能量 ${Math.round(target.energy * 100)}%`
}
