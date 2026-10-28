import * as faceapi from '@vladmandic/face-api'
import {
  EMOTION_ORDER,
  expressionsToAffect,
  getDominantEmotion,
} from '../data/emotions.js'

const MODEL_URL = `${import.meta.env.BASE_URL || '/'}models`
const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 416,
  scoreThreshold: 0.5,
})

// 首轮严格检测失败时的兜底：更大输入尺寸 + 更低阈值，提升小脸/弱光正脸的召回率
const FALLBACK_DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 512,
  scoreThreshold: 0.3,
})

async function detectAll(input, options) {
  return faceapi
    .detectAllFaces(input, options)
    .withFaceLandmarks(true)
    .withFaceExpressions()
}

let modelPromise = null

async function initializeBackend() {
  try {
    await faceapi.tf.setBackend('webgl')
  } catch {
    await faceapi.tf.setBackend('cpu')
  }
  await faceapi.tf.ready()
}

export function loadFaceModels() {
  if (modelPromise) return modelPromise

  modelPromise = (async () => {
    await initializeBackend()
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
    ])
    return {
      backend: faceapi.tf.getBackend(),
      detector: 'TinyFaceDetector · SSD MobileNetV1',
      expressions: 'FaceExpressionNet · 7-class softmax',
      landmarks: 'FaceLandmark68TinyNet',
    }
  })().catch((error) => {
    modelPromise = null
    throw error
  })

  return modelPromise
}

function normalizeExpressions(expressions = {}) {
  const total = EMOTION_ORDER.reduce((sum, key) => sum + (expressions[key] ?? 0), 0) || 1
  return Object.fromEntries(
    EMOTION_ORDER.map((key) => [
      key,
      Number(((expressions[key] ?? 0) / total).toFixed(5)),
    ])
  )
}

export async function detectPrimaryFace(input) {
  await loadFaceModels()

  let detections = await detectAll(input, DETECTOR_OPTIONS)
  if (!detections.length) {
    detections = await detectAll(input, FALLBACK_DETECTOR_OPTIONS)
  }

  if (!detections.length) return null

  const primary = detections.reduce((best, item) =>
    item.detection.box.area > best.detection.box.area ? item : best
  )

  const expressions = normalizeExpressions(primary.expressions)
  const affect = expressionsToAffect(expressions)
  const box = primary.detection.box

  return {
    expressions,
    dominant: getDominantEmotion(expressions),
    valence: affect.valence,
    energy: affect.energy,
    faceScore: primary.detection.score,
    faceCount: detections.length,
    box: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
    landmarks: primary.landmarks.positions.map((point) => ({ x: point.x, y: point.y })),
    timestamp: Date.now(),
  }
}

export function createEmotionSmoother(alpha = 0.35) {
  let smoothed = null
  let frames = 0

  return {
    push(sample) {
      if (!sample) return null
      frames += 1
      if (!smoothed) {
        smoothed = { ...sample.expressions }
      } else {
        smoothed = Object.fromEntries(
          EMOTION_ORDER.map((key) => [
            key,
            alpha * (sample.expressions[key] ?? 0) + (1 - alpha) * smoothed[key],
          ])
        )
      }

      const total = EMOTION_ORDER.reduce((sum, key) => sum + smoothed[key], 0) || 1
      const expressions = Object.fromEntries(
        EMOTION_ORDER.map((key) => [key, Number((smoothed[key] / total).toFixed(5))])
      )
      const affect = expressionsToAffect(expressions)
      const confidence = Math.min(
        1,
        Math.max(...Object.values(expressions)) * sample.faceScore
      )

      return {
        ...sample,
        expressions,
        dominant: getDominantEmotion(expressions),
        valence: affect.valence,
        energy: affect.energy,
        confidence: Number(confidence.toFixed(3)),
        frames,
        stable: frames >= 4,
        smoothed: frames > 1,
      }
    },
    reset() {
      smoothed = null
      frames = 0
    },
    get frames() {
      return frames
    },
  }
}

export { faceapi }
