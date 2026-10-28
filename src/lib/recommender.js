import { EMOTIONS, EMOTION_RELATIONS, clamp01 } from '../data/emotions.js'

export const STRATEGY_META = {
  regulate: {
    label: '情绪调节',
    short: '调节优先',
    description: '朝更舒适、更有能量的目标推进，适合需要被治愈或冷静下来的时刻。',
  },
  resonate: {
    label: '情绪共鸣',
    short: '共鸣优先',
    description: '寻找与你此刻情绪同频的声音，让音乐先理解你，再陪伴你。',
  },
}

export const RECOMMEND_WEIGHTS = {
  resonate: { valence: 0.42, energy: 0.26, mood: 0.22, quality: 0.1 },
  regulate: { valence: 0.52, energy: 0.3, mood: 0.1, quality: 0.08 },
}

export function getRecommendationTarget(emotionKey, strategy) {
  const emotion = EMOTIONS[emotionKey] ?? EMOTIONS.neutral
  return emotion.target[strategy] ?? emotion.target.regulate
}

function getMoodAffinity(trackMoods = [], emotionKey) {
  if (trackMoods.includes(emotionKey)) return 1
  const related = EMOTION_RELATIONS[emotionKey] ?? []
  if (trackMoods.some((mood) => related.includes(mood))) return 0.62
  return 0.22
}

function getMoodReason(trackMoods = [], emotionKey) {
  if (trackMoods.includes(emotionKey)) return `命中「${EMOTIONS[emotionKey].label}」标签`
  const related = EMOTION_RELATIONS[emotionKey] ?? []
  if (trackMoods.some((mood) => related.includes(mood))) return '情绪邻近，过渡自然'
  return '提供跨情绪的听感反差'
}

export function scoreTrack(track, emotionKey, strategy) {
  const target = getRecommendationTarget(emotionKey, strategy)
  const weights = RECOMMEND_WEIGHTS[strategy]
  const valenceFit = 1 - Math.abs(track.valence - target.valence) / 2
  const energyFit = 1 - Math.abs(track.energy - target.energy)
  const moodFit = getMoodAffinity(track.moods, emotionKey)
  const qualityFit = 0.4 + 0.6 * (track.popularity ?? 0.6)
  const score =
    weights.valence * valenceFit +
    weights.energy * energyFit +
    weights.mood * moodFit +
    weights.quality * qualityFit

  const reasons = [getMoodReason(track.moods, emotionKey)]
  if (valenceFit > 0.84) reasons.push('效价贴合目标')
  if (energyFit > 0.84) reasons.push('能量层级吻合')

  return {
    ...track,
    score: Number((clamp01(score) * 100).toFixed(1)),
    breakdown: {
      valence: Number((valenceFit * 100).toFixed(1)),
      energy: Number((energyFit * 100).toFixed(1)),
      mood: Number((moodFit * 100).toFixed(1)),
      quality: Number((qualityFit * 100).toFixed(1)),
    },
    reasons,
    target,
  }
}

/**
 * 离线曲库：先按情绪相关度裁剪，再取前 limit 首。
 * 相关度 = 情绪标签命中 / 邻近，或分数落在最优曲目附近；这样不同情绪的歌单不再完全一致。
 */
export function pickLocalTracks(tracks, emotionKey, strategy, limit = 8) {
  const ranked = tracks
    .map((track) => scoreTrack(track, emotionKey, strategy))
    .sort((a, b) => b.score - a.score)
  if (!ranked.length) return ranked

  const best = ranked[0].score
  const relevant = ranked.filter(
    (track) => track.breakdown.mood >= 62 || track.score >= best - 12
  )

  return (relevant.length >= 4 ? relevant : ranked).slice(0, limit)
}
