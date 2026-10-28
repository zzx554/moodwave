export const EMOTION_ORDER = ['happy', 'neutral', 'surprised', 'sad', 'angry', 'fearful', 'disgusted']

export const EMOTIONS = {
  happy: {
    label: '快乐',
    en: 'Happy',
    color: '#f4c95d',
    glow: 'rgba(244, 201, 93, .32)',
    valence: 0.86,
    arousal: 0.74,
    target: {
      resonate: { valence: 0.72, energy: 0.74 },
      regulate: { valence: 0.6, energy: 0.52 },
    },
    note: '明亮、轻盈，适合延续积极能量',
  },
  neutral: {
    label: '平静',
    en: 'Neutral',
    color: '#aab2bd',
    glow: 'rgba(170, 178, 189, .24)',
    valence: 0.04,
    arousal: 0.38,
    target: {
      resonate: { valence: 0.1, energy: 0.4 },
      regulate: { valence: 0.4, energy: 0.45 },
    },
    note: '低波动、低唤醒，适合稳定聚焦',
  },
  surprised: {
    label: '惊讶',
    en: 'Surprised',
    color: '#f0a35e',
    glow: 'rgba(240, 163, 94, .28)',
    valence: 0.12,
    arousal: 0.82,
    target: {
      resonate: { valence: 0.28, energy: 0.8 },
      regulate: { valence: 0.35, energy: 0.45 },
    },
    note: '高唤醒、开放，适合节奏鲜明的声音',
  },
  sad: {
    label: '悲伤',
    en: 'Sad',
    color: '#7b9de2',
    glow: 'rgba(123, 157, 226, .28)',
    valence: -0.62,
    arousal: 0.26,
    target: {
      resonate: { valence: -0.48, energy: 0.28 },
      regulate: { valence: 0.5, energy: 0.38 },
    },
    note: '低效价、低唤醒，需要被温柔接住',
  },
  angry: {
    label: '愤怒',
    en: 'Angry',
    color: '#ef6a5b',
    glow: 'rgba(239, 106, 91, .3)',
    valence: -0.68,
    arousal: 0.88,
    target: {
      resonate: { valence: -0.42, energy: 0.82 },
      regulate: { valence: 0.28, energy: 0.34 },
    },
    note: '负效价、高唤醒，适合先释放再降温',
  },
  fearful: {
    label: '恐惧',
    en: 'Fearful',
    color: '#a88bd4',
    glow: 'rgba(168, 139, 212, .28)',
    valence: -0.55,
    arousal: 0.68,
    target: {
      resonate: { valence: -0.3, energy: 0.55 },
      regulate: { valence: 0.45, energy: 0.35 },
    },
    note: '紧张、敏感，需要安全感和秩序感',
  },
  disgusted: {
    label: '厌恶',
    en: 'Disgusted',
    color: '#8fbb8d',
    glow: 'rgba(143, 187, 141, .26)',
    valence: -0.58,
    arousal: 0.52,
    target: {
      resonate: { valence: -0.36, energy: 0.5 },
      regulate: { valence: 0.4, energy: 0.38 },
    },
    note: '收缩、排斥，适合干净清新的声场',
  },
}

export const EMOTION_RELATIONS = {
  happy: ['surprised', 'neutral'],
  neutral: ['happy', 'sad'],
  surprised: ['happy', 'fearful'],
  sad: ['fearful', 'neutral'],
  angry: ['disgusted', 'surprised'],
  fearful: ['sad', 'disgusted'],
  disgusted: ['angry', 'fearful'],
}

export const EXPRESSION_LABELS = EMOTION_ORDER.map((key) => ({
  key,
  ...EMOTIONS[key],
}))

export function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

export function getDominantEmotion(expressions) {
  return EMOTION_ORDER.reduce(
    (best, key) => ((expressions?.[key] ?? 0) > (expressions?.[best] ?? 0) ? key : best),
    'neutral'
  )
}

export function expressionsToAffect(expressions) {
  const total = EMOTION_ORDER.reduce((sum, key) => sum + (expressions?.[key] ?? 0), 0) || 1
  const valence = EMOTION_ORDER.reduce(
    (sum, key) => sum + ((expressions?.[key] ?? 0) / total) * EMOTIONS[key].valence,
    0
  )
  const energy = EMOTION_ORDER.reduce(
    (sum, key) => sum + ((expressions?.[key] ?? 0) / total) * EMOTIONS[key].arousal,
    0
  )
  return {
    valence: Number(valence.toFixed(3)),
    energy: Number(clamp01(energy).toFixed(3)),
  }
}
