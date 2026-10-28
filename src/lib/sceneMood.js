import { EMOTION_ORDER, EMOTIONS } from '../data/emotions.js'

// 采样 64×64 已足够统计画面色彩分布，且单帧开销可忽略
const SAMPLE_SIZE = 64
// 低于该饱和度的像素视为灰色 / 中性
const SATURATION_GATE = 0.25
// 透明像素（表情包 PNG 背景）直接跳过，避免被当作黑色
const ALPHA_FLOOR = 10
// 中性像素权重：大面积白底 / 灰底不应淹没画面主体色
const NEUTRAL_WEIGHT = 0.1
// 色相情感锚点：把色轮切成 8 段，每段给出效价 / 唤醒中心值
const HUE_ANCHORS = [
  { from: 345, to: 25, valence: -0.66, arousal: 0.95, hex: '#e04b3a', label: '红' }, // 愤怒 / 强烈
  { from: 25, to: 45, valence: 0.35, arousal: 0.7, hex: '#e8892f', label: '橙' }, // 活力
  { from: 45, to: 70, valence: 0.7, arousal: 0.72, hex: '#e8c33a', label: '黄' }, // 快乐
  { from: 70, to: 160, valence: 0.3, arousal: 0.45, hex: '#63a94e', label: '绿' }, // 平静
  { from: 160, to: 200, valence: 0.05, arousal: 0.4, hex: '#3fa3a8', label: '青' }, // 中性
  { from: 200, to: 250, valence: -0.5, arousal: 0.28, hex: '#3d6bb5', label: '蓝' }, // 悲伤
  { from: 250, to: 300, valence: -0.35, arousal: 0.4, hex: '#7b55b8', label: '紫' }, // 忧郁
  { from: 300, to: 345, valence: -0.2, arousal: 0.5, hex: '#b8497f', label: '品红' }, // 暧昧
]
const NEUTRAL_ANCHOR = { valence: 0.04, arousal: 0.38 }

export { HUE_ANCHORS }

function clamp(value, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function matchAnchor(hue) {
  return HUE_ANCHORS.find((anchor) =>
    anchor.from < anchor.to
      ? hue >= anchor.from && hue < anchor.to
      : hue >= anchor.from || hue < anchor.to
  )
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`
}

function hslFromRgb(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { hue: 0, saturation: 0, lightness }
  const saturation =
    lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue
  if (max === r) hue = ((g - b) / delta) % 6
  else if (max === g) hue = (b - r) / delta + 2
  else hue = (r - g) / delta + 4
  hue *= 60
  if (hue < 0) hue += 360
  return { hue, saturation, lightness }
}

/**
 * 无脸画面（表情包 / 插画 / 风景）的情绪推断：
 * 1. 64×64 降采样，逐像素转 HSL
 * 2. 饱和像素按色相落入 8 个情感锚点投票，灰色像素计入中性
 * 3. 用亮度修正效价、用对比度与亮度修正唤醒
 * 4. 用同一套情感坐标（V/E）反推 7 类概率，保证与主链路数据一致
 */
export function analyzeSceneMood(input) {
  if (!input || typeof document === 'undefined') return null

  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null

  try {
    context.drawImage(input, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
  } catch {
    return null
  }

  let pixels
  try {
    pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data
  } catch {
    // 跨域图片会污染画布，此时放弃色调推断
    return null
  }

  let coloredWeight = 0
  let coloredCount = 0
  let valenceSum = 0
  let arousalSum = 0
  let neutralCount = 0
  let luminanceSum = 0
  let luminanceSquareSum = 0
  let subjectLuminanceSum = 0
  let saturationSum = 0
  let warmthSum = 0
  let total = 0
  const buckets = new Map()

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < ALPHA_FLOOR) continue

    const r = pixels[index] / 255
    const g = pixels[index + 1] / 255
    const b = pixels[index + 2] / 255

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    luminanceSum += luminance
    luminanceSquareSum += luminance * luminance
    warmthSum += r - b
    total += 1

    const { hue, saturation } = hslFromRgb(r, g, b)
    saturationSum += saturation

    if (saturation < SATURATION_GATE) {
      neutralCount += 1
      continue
    }

    const anchor = matchAnchor(hue)
    if (!anchor) {
      neutralCount += 1
      continue
    }

    coloredWeight += saturation
    coloredCount += 1
    subjectLuminanceSum += luminance
    valenceSum += anchor.valence * saturation
    arousalSum += anchor.arousal * saturation

    const bucket = buckets.get(anchor) ?? { weight: 0, r: 0, g: 0, b: 0 }
    bucket.weight += saturation
    bucket.r += r * 255
    bucket.g += g * 255
    bucket.b += b * 255
    bucket.pixels = (bucket.pixels ?? 0) + 1
    buckets.set(anchor, bucket)
  }

  if (!total) return null

  const brightness = luminanceSum / total
  const luminanceVariance = Math.max(0, luminanceSquareSum / total - brightness * brightness)
  const contrast = clamp(Math.sqrt(luminanceVariance) / 0.5, 0, 1)
  const saturationMean = saturationSum / total
  const warmth = clamp(warmthSum / total)

  // 表情包常见「白底 + 彩色主体」：明暗修正只取彩色主体，
  // 避免大面积留白把情绪推向正效价
  const coloredShare = coloredCount / total
  const subjectBrightness = coloredCount ? subjectLuminanceSum / coloredCount : brightness
  const toneBrightness = coloredShare > 0.02 ? subjectBrightness : brightness

  const weightTotal = coloredWeight + neutralCount * NEUTRAL_WEIGHT
  const neutralWeightSum = neutralCount * NEUTRAL_WEIGHT
  const baseValence =
    (valenceSum + NEUTRAL_ANCHOR.valence * neutralWeightSum) / weightTotal
  const baseArousal =
    (arousalSum + NEUTRAL_ANCHOR.arousal * neutralWeightSum) / weightTotal

  const valence = clamp(baseValence + 0.2 * (toneBrightness - 0.5) * 2 * (0.4 + saturationMean))
  const energy = clamp(
    baseArousal + 0.18 * (contrast - 0.35) + 0.15 * (toneBrightness - 0.5) * 2,
    0,
    1
  )

  // 用情感坐标距离反推 7 类概率，与面部链路共用同一套坐标
  const distances = EMOTION_ORDER.map((key) => {
    const emotion = EMOTIONS[key]
    return Math.hypot(valence - emotion.valence, energy - emotion.arousal)
  })
  const temperature = 0.45
  const exponentials = distances.map((distance) => Math.exp(-distance / temperature))
  const sum = exponentials.reduce((acc, value) => acc + value, 0) || 1
  const expressions = Object.fromEntries(
    EMOTION_ORDER.map((key, index) => [key, Number((exponentials[index] / sum).toFixed(5))])
  )
  const dominant = EMOTION_ORDER.reduce(
    (best, key) => (expressions[key] > expressions[best] ? key : best),
    EMOTION_ORDER[0]
  )
  const bestDistance = Math.min(...distances)
  const confidence = clamp(1 - bestDistance / 1.6, 0.32, 0.92)

  const palette = [...buckets.values()]
    .filter((bucket) => bucket.pixels)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map((bucket) => ({
      color: rgbToHex(bucket.r / bucket.pixels, bucket.g / bucket.pixels, bucket.b / bucket.pixels),
      ratio: Number((bucket.weight / (coloredWeight || 1)).toFixed(2)),
    }))

  return {
    expressions,
    dominant,
    valence: Number(valence.toFixed(3)),
    energy: Number(energy.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    palette,
    scene: {
      brightness: Number(brightness.toFixed(3)),
      saturation: Number(saturationMean.toFixed(3)),
      contrast: Number(contrast.toFixed(3)),
      warmth: Number(warmth.toFixed(3)),
      coloredRatio: Number((coloredCount / (coloredCount + neutralCount || 1)).toFixed(3)),
    },
    faceScore: 0,
    faceCount: 0,
    frames: 1,
    stable: false,
    smoothed: false,
    method: 'scene',
    timestamp: Date.now(),
  }
}
