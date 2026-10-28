<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { EMOTIONS } from '../data/emotions.js'
import { createEmotionSmoother, detectPrimaryFace, loadFaceModels } from '../lib/faceEngine.js'
import { analyzeSceneMood } from '../lib/sceneMood.js'
import Icon from './Icon.vue'

const emit = defineEmits(['emotion', 'status', 'model'])

const mode = ref('camera')
const modelState = ref('loading')
const modelError = ref('')
const modelInfo = ref(null)
const sourceReady = ref(false)
const fileName = ref('')
const resolution = ref('')
const imageUrl = ref('')
const videoUrl = ref('')
const snapshot = ref('')
const cameraActive = ref(false)
const realtime = ref(true)
const isAnalyzing = ref(false)
const frames = ref(0)
const status = ref('idle')
const statusText = ref('等待画面')
const errorMessage = ref('')

const stageEl = ref(null)
const imageEl = ref(null)
const videoEl = ref(null)
const overlayEl = ref(null)
const fileInput = ref(null)

const smoother = createEmotionSmoother(0.35)
let stream = null
let analysisTimer = null
let objectUrls = []
let resizeObserver = null
let lastDetection = null
let destroyed = false
let analysisToken = 0

const modes = [
  { key: 'camera', label: '实时摄像头', icon: 'camera' },
  { key: 'image', label: '上传图片', icon: 'upload' },
  { key: 'video', label: '打开视频', icon: 'film' },
]

const modeMeta = computed(() => {
  const map = {
    camera: {
      cta: cameraActive.value ? '关闭摄像头' : '开启摄像头',
      emptyTitle: '把此刻交给镜头',
      emptyText: '允许浏览器访问摄像头，情绪光谱将实时生成。',
      icon: 'camera',
      accept: '',
    },
    image: {
      cta: '选择图片',
      emptyTitle: '上传一张清晰的正脸照',
      emptyText: '支持 JPG / PNG / WEBP，也可以把图片拖进此区域。',
      icon: 'upload',
      accept: 'image/*',
    },
    video: {
      cta: '打开视频',
      emptyTitle: '打开一段有人脸的视频',
      emptyText: '支持 MP4 / WEBM / MOV，画面只在本地浏览器内处理。',
      icon: 'film',
      accept: 'video/*',
    },
  }
  return map[mode.value]
})

const hasSource = computed(() => sourceReady.value || Boolean(snapshot.value))
const isMirrored = computed(() => mode.value === 'camera' && !snapshot.value)
const stageModeLabel = computed(() => {
  if (snapshot.value) return 'PHOTO'
  if (mode.value === 'image') return 'STILL'
  return 'REALTIME'
})
const sourceLabel = computed(() => {
  if (snapshot.value) return '拍照定格'
  if (mode.value === 'camera') return '实时摄像头'
  if (mode.value === 'video') return '视频文件'
  return '静态图片'
})
const modelLabel = computed(() => {
  if (modelState.value === 'ready') return '本地模型就绪'
  if (modelState.value === 'loading') return '模型加载中'
  return '模型加载失败'
})

onMounted(async () => {
  emit('model', { state: 'loading' })
  try {
    modelInfo.value = await loadFaceModels()
    modelState.value = 'ready'
    emit('model', { state: 'ready', ...modelInfo.value })
  } catch (error) {
    modelState.value = 'error'
    modelError.value = error?.message || '无法加载本地模型'
    emit('model', { state: 'error', message: modelError.value })
  }

  if (stageEl.value) {
    resizeObserver = new ResizeObserver(() => {
      if (lastDetection && !snapshot.value) drawOverlay(lastDetection)
    })
    resizeObserver.observe(stageEl.value)
  }
})

onBeforeUnmount(() => {
  destroyed = true
  resetSession()
  resizeObserver?.disconnect()
})

function emitStatus(phase, text, extra = {}) {
  status.value = phase
  statusText.value = text
  emit('status', { phase, text, source: sourceLabel.value, ...extra })
}

function stopAnalysisLoop() {
  if (analysisTimer) {
    clearInterval(analysisTimer)
    analysisTimer = null
  }
}

function startAnalysisLoop() {
  stopAnalysisLoop()
  if (!realtime.value || !sourceReady.value || snapshot.value || mode.value === 'image') return
  analysisTimer = setInterval(() => analyzeFrame(true), 900)
}

function stopStream() {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
    stream = null
  }
  cameraActive.value = false
}

function clearOverlay() {
  lastDetection = null
  const canvas = overlayEl.value
  if (!canvas) return
  const context = canvas.getContext('2d')
  context?.clearRect(0, 0, canvas.width, canvas.height)
}

function resetSession() {
  stopAnalysisLoop()
  stopStream()
  analysisToken += 1
  isAnalyzing.value = false
  if (videoEl.value) {
    videoEl.value.onerror = null
    videoEl.value.onloadeddata = null
    videoEl.value.pause()
    videoEl.value.srcObject = null
    videoEl.value.removeAttribute('src')
    videoEl.value.load()
  }
  objectUrls.forEach((url) => URL.revokeObjectURL(url))
  objectUrls = []
  imageUrl.value = ''
  videoUrl.value = ''
  snapshot.value = ''
  sourceReady.value = false
  fileName.value = ''
  resolution.value = ''
  frames.value = 0
  errorMessage.value = ''
  clearOverlay()
  smoother.reset()
  if (fileInput.value) fileInput.value.value = ''
  emitStatus('idle', '等待画面')
}

function selectMode(nextMode) {
  if (nextMode === mode.value) return
  resetSession()
  mode.value = nextMode
  realtime.value = true
}

function triggerFilePicker() {
  if (mode.value === 'camera') return
  fileInput.value?.click()
}

async function switchModeAndPick(nextMode) {
  if (mode.value !== nextMode) {
    resetSession()
    mode.value = nextMode
    realtime.value = true
    await nextTick()
  }
  triggerFilePicker()
}

function handlePrimaryAction() {
  if (mode.value === 'camera') {
    if (cameraActive.value) {
      resetSession()
    } else {
      startCamera()
    }
    return
  }
  triggerFilePicker()
}

function describeCameraError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '摄像头权限被拒绝：请点击地址栏左侧的权限图标允许摄像头，并确认 Windows「设置 → 隐私和安全性 → 相机」已允许应用访问。'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '没有检测到可用的摄像头设备：请连接摄像头，或在 Windows「设置 → 隐私和安全性 → 相机」中检查设备是否被禁用。'
    case 'NotReadableError':
    case 'TrackStartError':
      return '摄像头被其他程序占用：关闭正在使用摄像头的软件（会议、直播等）后重试。'
    case 'OverconstrainedError':
      return '当前摄像头不支持请求的分辨率，已自动降级仍失败，请改用其他摄像头。'
    default:
      return `无法打开摄像头：${error?.message || '未知错误'}`
  }
}

async function requestCameraStream() {
  const constraints = [
    { audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
    { audio: false, video: true },
  ]
  let lastError = null
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint)
    } catch (error) {
      lastError = error
      const retryable = error?.name === 'OverconstrainedError' || error?.name === 'NotFoundError'
      if (!retryable) throw error
    }
  }
  throw lastError
}

async function startCamera() {
  resetSession()
  mode.value = 'camera'
  errorMessage.value = ''

  if (!navigator.mediaDevices?.getUserMedia) {
    errorMessage.value = '当前浏览器不支持摄像头访问，请改用 HTTPS 或 localhost 打开。'
    emitStatus('error', '摄像头不可用')
    return
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices?.()
    if (devices?.length && !devices.some((device) => device.kind === 'videoinput')) {
      errorMessage.value =
        '没有检测到可用的摄像头设备：请连接摄像头，或改用「上传图片」「打开视频」完成识别。'
      emitStatus('error', '摄像头不可用')
      return
    }

    emitStatus('searching', '正在请求摄像头权限')
    stream = await requestCameraStream()
    cameraActive.value = true
    await nextTick()
    const video = videoEl.value
    if (!video) throw new Error('摄像头画面未初始化')
    video.srcObject = stream
    await video.play()
    sourceReady.value = true
    fileName.value = '前置摄像头'
    resolution.value = `${video.videoWidth} × ${video.videoHeight}`
    frames.value = 0
    startAnalysisLoop()
    analyzeFrame(true)
  } catch (error) {
    stopStream()
    errorMessage.value = describeCameraError(error)
    emitStatus('error', '摄像头打开失败')
  }
}

function handleFileChange(event) {
  const file = event.target.files?.[0]
  if (file) loadFile(file)
  event.target.value = ''
}

function loadFile(file) {
  if (!file) return
  if (file.type.startsWith('image/')) {
    loadImage(file)
    return
  }
  if (file.type.startsWith('video/')) {
    loadVideo(file)
    return
  }
  errorMessage.value = '请选择图片或视频文件。'
}

function loadImage(file) {
  resetSession()
  mode.value = 'image'
  const url = URL.createObjectURL(file)
  objectUrls.push(url)
  imageUrl.value = url
  fileName.value = file.name
  errorMessage.value = ''
  emitStatus('searching', '正在读取图片')

  nextTick(() => {
    const image = imageEl.value
    if (!image) return
    image.onerror = handleImageError
    if (image.complete) {
      handleImageReady()
    } else {
      image.onload = handleImageReady
    }
  })
}

function handleImageError() {
  errorMessage.value = '图片无法解码，请改用 JPG / PNG / WEBP 格式后重试。'
  emitStatus('error', '图片无法读取')
}

function handleImageReady() {
  const image = imageEl.value
  if (!image) return
  if (!image.naturalWidth) {
    handleImageError()
    return
  }
  sourceReady.value = true
  resolution.value = `${image.naturalWidth} × ${image.naturalHeight}`
  emitStatus('searching', '正在定位人脸')
  requestAnimationFrame(() => analyzeFrame(false))
}

function loadSampleImage() {
  resetSession()
  mode.value = 'image'
  imageUrl.value = '/sample-face.jpg'
  fileName.value = '示例人像 · face-api demo'
  emitStatus('searching', '正在读取示例图片')
  nextTick(() => {
    const image = imageEl.value
    if (!image) return
    image.onerror = handleImageError
    if (image.complete) {
      handleImageReady()
    } else {
      image.onload = handleImageReady
    }
  })
}

async function loadVideo(file) {
  resetSession()
  mode.value = 'video'
  const url = URL.createObjectURL(file)
  objectUrls.push(url)
  videoUrl.value = url
  fileName.value = file.name
  errorMessage.value = ''

  await nextTick()
  const video = videoEl.value
  if (!video) return
  video.onloadeddata = handleVideoReady
  video.onerror = () => {
    errorMessage.value = '视频读取失败，请尝试 MP4 / WEBM 格式。'
    emitStatus('error', '视频读取失败')
  }
  video.src = url
  video.loop = true
  video.muted = true
}

async function handleVideoReady() {
  const video = videoEl.value
  if (!video) return
  try {
    await video.play()
  } catch {
    // 浏览器可能阻止自动播放，保留首帧仍可识别
  }
  sourceReady.value = true
  resolution.value = `${video.videoWidth} × ${video.videoHeight}`
  emitStatus('searching', '正在定位人脸')
  startAnalysisLoop()
  analyzeFrame(true)
}

function applySceneMood(media, extra = {}) {
  const scene = analyzeSceneMood(media)
  if (!scene) return false
  frames.value += 1
  lastDetection = null
  clearOverlay()
  emitStatus('scene', '未检出人脸 · 按画面色调推断', { scene: true })
  emit('emotion', {
    ...scene,
    frames: frames.value,
    source: sourceLabel.value,
    inputMode: mode.value,
    fileName: fileName.value,
    isSnapshot: false,
    ...extra,
  })
  return true
}

async function analyzeFrame(useSmoothing = true) {
  if (isAnalyzing.value || destroyed) return
  if (!sourceReady.value || snapshot.value) return

  const media = mode.value === 'image' ? imageEl.value : videoEl.value
  if (!media) return
  if (mode.value === 'video' && media.readyState < 2) return

  isAnalyzing.value = true
  const token = ++analysisToken
  if (status.value !== 'found') emitStatus('searching', '正在识别表情')

  try {
    const result = await detectPrimaryFace(media)
    if (token !== analysisToken) return
    if (!result) {
      clearOverlay()
      // 图片 / 视频没有检出人脸时，退化为画面色调推断，表情包同样能给出情绪
      if (mode.value !== 'camera' && applySceneMood(media)) return
      emitStatus('no-face', '未检测到人脸，请正对镜头', { faces: 0 })
      if (mode.value === 'image') emit('emotion', null)
      return
    }

    frames.value += 1
    resolution.value = `${media.videoWidth || media.naturalWidth} × ${
      media.videoHeight || media.naturalHeight
    }`
    const finalResult = smoother.push(result)
    finalResult.singleFrame = !useSmoothing
    if (!useSmoothing) {
      finalResult.frames = 1
      finalResult.stable = false
      finalResult.smoothed = false
    }

    lastDetection = finalResult
    drawOverlay(finalResult)
    emitStatus('found', '人脸已锁定', { faces: finalResult.faceCount })
    emit('emotion', {
      ...finalResult,
      source: sourceLabel.value,
      inputMode: mode.value,
      fileName: fileName.value,
      isSnapshot: false,
    })
  } catch (error) {
    if (token !== analysisToken) return
    errorMessage.value = `识别失败：${error?.message || '请检查模型文件与浏览器权限'}`
    emitStatus('error', '识别失败', { message: errorMessage.value })
  } finally {
    if (token === analysisToken) isAnalyzing.value = false
  }
}

async function toggleRealtime() {
  realtime.value = !realtime.value
  if (realtime.value) {
    startAnalysisLoop()
    if (sourceReady.value && !snapshot.value) analyzeFrame(true)
  } else {
    stopAnalysisLoop()
  }
}

async function capturePhoto() {
  const video = videoEl.value
  if (!video || video.readyState < 2 || !video.videoWidth) return

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const context = canvas.getContext('2d')
  if (!context) return

  if (mode.value === 'camera') {
    context.translate(canvas.width, 0)
    context.scale(-1, 1)
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height)

  snapshot.value = canvas.toDataURL('image/jpeg', 0.9)
  stopAnalysisLoop()
  video.pause()
  clearOverlay()
  frames.value += 1
  emitStatus('searching', '正在分析定格画面')

  try {
    const result = await detectPrimaryFace(canvas)
    if (!result) {
      if (applySceneMood(canvas, { isSnapshot: true, source: '拍照定格' })) return
      emitStatus('no-face', '定格画面中未检测到人脸', { faces: 0 })
      return
    }
    smoother.reset()
    const finalResult = smoother.push(result)
    finalResult.isSnapshot = true
    finalResult.singleFrame = true
    finalResult.frames = 1
    finalResult.stable = false
    finalResult.smoothed = false
    emitStatus('found', '定格画面已分析', { faces: finalResult.faceCount })
    emit('emotion', {
      ...finalResult,
      source: '拍照定格',
      inputMode: mode.value,
      fileName: fileName.value,
      isSnapshot: true,
    })
  } catch (error) {
    errorMessage.value = `定格分析失败：${error?.message || '未知错误'}`
    emitStatus('error', '定格分析失败')
  }
}

async function resumeLive() {
  snapshot.value = ''
  errorMessage.value = ''
  const video = videoEl.value
  if (video) {
    try {
      await video.play()
    } catch {
      // 如果自动播放被阻止，可手动点击画面
    }
  }
  startAnalysisLoop()
  analyzeFrame(true)
}

function handleDrop(event) {
  const file = event.dataTransfer?.files?.[0]
  if (file) loadFile(file)
}

function retryModels() {
  modelState.value = 'loading'
  modelError.value = ''
  window.location.reload()
}

function drawOverlay(result) {
  if (!result || snapshot.value) return
  const canvas = overlayEl.value
  const stage = stageEl.value
  const media = mode.value === 'image' ? imageEl.value : videoEl.value
  if (!canvas || !stage || !media) return

  const width = stage.clientWidth
  const height = stage.clientHeight
  const naturalWidth = media.videoWidth || media.naturalWidth
  const naturalHeight = media.videoHeight || media.naturalHeight
  if (!width || !height || !naturalWidth || !naturalHeight) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)

  const scale = Math.min(width / naturalWidth, height / naturalHeight)
  const offsetX = (width - naturalWidth * scale) / 2
  const offsetY = (height - naturalHeight * scale) / 2
  const box = result.box
  const x = offsetX + box.x * scale
  const y = offsetY + box.y * scale
  const boxWidth = box.width * scale
  const boxHeight = box.height * scale
  const color = EMOTIONS[result.dominant]?.color || '#f4c95d'

  context.save()
  context.strokeStyle = color
  context.lineWidth = 1.5
  context.globalAlpha = 0.92
  context.strokeRect(x, y, boxWidth, boxHeight)

  context.fillStyle = color
  context.globalAlpha = 0.95
  const corner = Math.min(22, boxWidth * 0.16)
  const corners = [
    [x, y, 1, 1],
    [x + boxWidth, y, -1, 1],
    [x, y + boxHeight, 1, -1],
    [x + boxWidth, y + boxHeight, -1, -1],
  ]
  const cornerPaths = [[0, 0, corner, 0], [0, 0, 0, corner]]
  context.lineWidth = 3
  corners.forEach(([cx, cy, dx, dy]) => {
    cornerPaths.forEach(([sx, sy, ex, ey]) => {
      context.beginPath()
      context.moveTo(cx + sx * dx, cy + sy * dy)
      context.lineTo(cx + ex * dx, cy + ey * dy)
      context.stroke()
    })
  })

  context.fillStyle = '#ffffff'
  context.globalAlpha = 0.65
  result.landmarks?.forEach((point) => {
    const px = offsetX + point.x * scale
    const py = offsetY + point.y * scale
    context.beginPath()
    context.arc(px, py, 1.25, 0, Math.PI * 2)
    context.fill()
  })
  context.restore()
}
</script>

<template>
  <section class="panel vision-panel">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">01 / CAPTURE</span>
        <h2>捕捉此刻的表情</h2>
      </div>
      <div class="model-badge" :class="modelState">
        <span class="status-dot"></span>
        <span>{{ modelLabel }}</span>
      </div>
    </div>

    <div class="mode-tabs" role="tablist" aria-label="人脸输入方式">
      <button
        v-for="item in modes"
        :key="item.key"
        class="mode-tab"
        :class="{ active: mode === item.key }"
        role="tab"
        :aria-selected="mode === item.key"
        @click="selectMode(item.key)"
      >
        <Icon :name="item.icon" :size="15" />
        <span>{{ item.label }}</span>
      </button>
    </div>

    <div
      ref="stageEl"
      class="vision-stage"
      @dragover.prevent
      @drop.prevent="handleDrop"
    >
      <div class="stage-grid" aria-hidden="true"></div>

      <img
        v-if="mode === 'image' && imageUrl && !snapshot"
        ref="imageEl"
        class="media-layer"
        :src="imageUrl"
        alt="待识别的人脸图片"
      />

      <video
        v-if="mode !== 'image'"
        v-show="!snapshot"
        ref="videoEl"
        class="media-layer video-layer"
        :class="{ mirrored: mode === 'camera' }"
        playsinline
        muted
        :loop="mode === 'video'"
      ></video>

      <img
        v-if="snapshot"
        class="media-layer snapshot-layer"
        :src="snapshot"
        alt="拍照定格画面"
      />

      <canvas
        ref="overlayEl"
        class="overlay-layer"
        :class="{ mirrored: isMirrored }"
      ></canvas>

      <div v-if="!hasSource" class="stage-empty">
        <div class="scan-orb">
          <span class="orbit orbit-a"></span>
          <span class="orbit orbit-b"></span>
          <span class="orb-core"><Icon :name="modeMeta.icon" :size="24" /></span>
        </div>
        <h3>{{ modeMeta.emptyTitle }}</h3>
        <p>{{ modeMeta.emptyText }}</p>
        <div class="stage-empty-actions">
          <button class="button button-light" @click="handlePrimaryAction">
            <Icon :name="mode === 'camera' ? 'camera' : mode === 'image' ? 'upload' : 'filmPlay'" :size="16" />
            {{ modeMeta.cta }}
          </button>
          <button v-if="mode === 'image'" class="button button-text" @click="loadSampleImage">
            使用示例人像
            <Icon name="chevronRight" :size="14" />
          </button>
        </div>
        <div v-if="mode === 'camera' && errorMessage" class="stage-empty-fallback">
          <span>改用其他输入方式</span>
          <button class="button button-text" @click="switchModeAndPick('image')">
            <Icon name="upload" :size="14" />
            上传图片
          </button>
          <button class="button button-text" @click="switchModeAndPick('video')">
            <Icon name="film" :size="14" />
            打开视频
          </button>
        </div>
      </div>

      <div class="stage-topline">
        <span class="stage-code">
          {{ mode === 'camera' ? 'CAM 01 · LIVE' : mode === 'video' ? 'VIDEO · LOCAL' : 'STILL · LOCAL' }}
        </span>
        <span v-if="hasSource" class="stage-live" :class="status">
          <i></i>{{ status === 'found' ? 'FACE LOCKED' : status === 'no-face' ? 'NO FACE' : status === 'scene' ? 'TONE SCAN' : 'SCANNING' }}
        </span>
      </div>

      <div v-if="hasSource" class="stage-meta">
        <span>FRAME {{ String(frames).padStart(3, '0') }}</span>
        <span>{{ resolution }}</span>
        <span>{{ stageModeLabel }}</span>
      </div>

      <div v-if="snapshot" class="stage-note">
        <span>已定格 · 单帧分析</span>
        <button @click="resumeLive">返回实时</button>
      </div>

      <div v-if="hasSource && status === 'no-face'" class="stage-notice">
        <strong>未检测到人脸</strong>
        <span>请换一张清晰的正脸照片，避免侧脸、遮挡或脸部过小。</span>
      </div>

      <button
        v-if="mode !== 'image' && sourceReady && !snapshot"
        class="capture-fab"
        title="拍照并分析当前画面"
        @click="capturePhoto"
      >
        <span></span>
      </button>

      <div v-if="errorMessage" class="stage-error">
        <Icon name="info" :size="16" />
        <span>{{ errorMessage }}</span>
        <button v-if="modelState === 'error'" @click="retryModels">重试</button>
      </div>

      <div v-if="modelState === 'loading' && hasSource" class="stage-overlay-status">
        <span class="loading-ring"></span>
        <span>正在加载本地情绪模型</span>
      </div>
    </div>

    <div class="vision-toolbar">
      <div class="toolbar-main">
        <button class="button button-main" @click="handlePrimaryAction">
          <Icon
            :name="mode === 'camera' ? 'camera' : mode === 'image' ? 'upload' : 'film'"
            :size="16"
          />
          {{ modeMeta.cta }}
        </button>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          :accept="modeMeta.accept"
          @change="handleFileChange"
        />

        <button
          v-if="mode !== 'image'"
          class="button button-ghost"
          :class="{ active: realtime }"
          :disabled="!sourceReady || Boolean(snapshot)"
          @click="toggleRealtime"
        >
          <span class="toggle-indicator"></span>
          实时分析 {{ realtime ? 'ON' : 'OFF' }}
        </button>

        <button
          v-if="mode !== 'image'"
          class="button button-ghost"
          :disabled="!sourceReady || Boolean(snapshot)"
          @click="capturePhoto"
        >
          <Icon name="aperture" :size="15" />
          拍照
        </button>

        <button v-if="hasSource" class="button button-quiet" @click="resetSession">
          清除画面
        </button>
      </div>

      <div class="toolbar-meta">
        <span v-if="fileName" class="file-name">{{ fileName }}</span>
        <span class="privacy-chip"><Icon name="scan" :size="13" /> 画面仅在本机处理</span>
      </div>
    </div>

    <p v-if="modelState === 'error'" class="inline-error">
      本地模型加载失败：{{ modelError }}
    </p>
    <p v-else class="fine-print">
      TinyFaceDetector 416×416 · FaceLandmark68Tiny · FaceExpressionNet；采样间隔约 900ms。
    </p>
  </section>
</template>
