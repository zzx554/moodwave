<script setup>
import { computed, nextTick, ref } from 'vue'
import AlgorithmSection from './components/AlgorithmSection.vue'
import EmotionPanel from './components/EmotionPanel.vue'
import Icon from './components/Icon.vue'
import PlayerBar from './components/PlayerBar.vue'
import RecommendationDeck from './components/RecommendationDeck.vue'
import VisionStudio from './components/VisionStudio.vue'
import { EMOTIONS } from './data/emotions.js'
import { LOCAL_TRACKS } from './data/tracks.js'

const emotionResult = ref(null)
const visionStatus = ref(null)
const modelInfo = ref(null)
const modelState = ref('loading')
const playRequest = ref(null)
const algorithmOpen = ref(false)
let playNonce = 0

const currentEmotion = computed(() => EMOTIONS[emotionResult.value?.dominant] ?? null)
const confidenceLabel = computed(() =>
  emotionResult.value?.confidence ? `${Math.round(emotionResult.value.confidence * 100)}%` : '—'
)
const signalPhase = computed(() => visionStatus.value?.phase ?? 'idle')
const localTrackCount = computed(() => String(LOCAL_TRACKS.length).padStart(2, '0'))

function handleEmotion(result) {
  emotionResult.value = result
}

function handleStatus(status) {
  visionStatus.value = status
}

function handleModel(model) {
  modelState.value = model.state
  if (model.state === 'ready') modelInfo.value = model
}

function handlePlay({ track, queue }) {
  playNonce += 1
  playRequest.value = { track, queue, nonce: playNonce }
}

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function openAlgorithm() {
  if (!algorithmOpen.value) {
    algorithmOpen.value = true
    await nextTick()
  }
  scrollTo('algorithm')
}

function closeAlgorithm() {
  algorithmOpen.value = false
  scrollTo('recommend')
}

const tickerBars = [22, 40, 64, 34, 78, 52, 88, 42, 68, 30, 54, 76, 44, 62, 26, 70, 48, 84, 38, 58, 28, 74]
</script>

<template>
  <div class="app-shell">
    <div class="ambient ambient-a" aria-hidden="true"></div>
    <div class="ambient ambient-b" aria-hidden="true"></div>
    <div class="grain" aria-hidden="true"></div>

    <header class="site-header">
      <button class="brand" @click="scrollTo('top')">
        <span class="brand-mark"><Icon name="wave" :size="20" /></span>
        <span class="brand-copy">
          <strong>MOODWAVE</strong>
          <small>情绪声场</small>
        </span>
      </button>

      <nav class="site-nav" aria-label="页面导航">
        <button @click="scrollTo('capture')">情绪捕捉</button>
        <button @click="scrollTo('recommend')">推荐歌单</button>
      </nav>

      <div class="header-tools">
        <span class="engine-state" :class="modelState">
          <i></i>
          {{ modelState === 'ready' ? '本地引擎在线' : modelState === 'error' ? '模型异常' : '引擎启动中' }}
        </span>
        <button
          class="method-chip"
          :class="{ 'is-open': algorithmOpen }"
          type="button"
          title="查看算法说明"
          @click="openAlgorithm"
        >
          <Icon name="info" :size="13" />
          算法说明
        </button>
      </div>
    </header>

    <main id="top" class="page">
      <section class="hero">
        <div class="hero-copy">
          <span class="hero-eyebrow"><i></i> AFFECTIVE COMPUTING · LOCAL FIRST</span>
          <h1>让情绪，<br /><em>先听见。</em></h1>
          <p class="hero-lead">
            上传照片或表情包，打开一段视频，也可以直接面对镜头。浏览器在本地读懂七种表情；
            画面里没有脸时，就读取色彩与明暗，再把此刻的情绪翻译成一首合适的歌。
          </p>
          <div class="hero-actions">
            <button class="button button-accent" @click="scrollTo('capture')">
              <Icon name="scan" :size="17" />
              开始情绪识别
            </button>
            <button class="button button-text" @click="scrollTo('recommend')">
              查看推荐逻辑
              <Icon name="chevronRight" :size="15" />
            </button>
          </div>
          <div class="hero-stats">
            <div>
              <strong>07</strong>
              <span>情绪类别</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>本地推理</span>
            </div>
            <div>
              <strong>{{ localTrackCount }}</strong>
              <span>离线曲目</span>
            </div>
            <div>
              <strong>∞</strong>
              <span>在线试听</span>
            </div>
          </div>
        </div>

        <aside class="signal-monitor" :style="{ '--signal-color': currentEmotion?.color || '#f4c95d' }">
          <div class="monitor-head">
            <span>LIVE AFFECT SIGNAL</span>
            <span class="monitor-state" :class="signalPhase">
              <i></i>
              {{ signalPhase === 'found' ? 'LOCKED' : signalPhase === 'searching' ? 'SCANNING' : signalPhase === 'no-face' ? 'NO FACE' : signalPhase === 'scene' ? 'TONE' : 'STANDBY' }}
            </span>
          </div>

          <div class="monitor-visual">
            <span class="monitor-orbit orbit-one"></span>
            <span class="monitor-orbit orbit-two"></span>
            <span class="monitor-orbit orbit-three"></span>
            <div class="monitor-core">
              <Icon name="wave" :size="28" />
              <small>{{ currentEmotion?.en || 'AWAITING' }}</small>
            </div>
            <span class="monitor-tick tick-a"></span>
            <span class="monitor-tick tick-b"></span>
            <span class="monitor-tick tick-c"></span>
            <span class="monitor-tick tick-d"></span>
          </div>

          <div class="monitor-readout">
            <div>
              <span>DOMINANT</span>
              <strong>{{ currentEmotion?.label || '等待识别' }}</strong>
            </div>
            <div>
              <span>CONFIDENCE</span>
              <strong>{{ confidenceLabel }}</strong>
            </div>
            <div>
              <span>VALENCE</span>
              <strong>{{ emotionResult ? (emotionResult.valence > 0 ? '+' : '') + emotionResult.valence.toFixed(2) : '—' }}</strong>
            </div>
          </div>

          <div class="monitor-wave" :class="{ active: Boolean(emotionResult) }" aria-hidden="true">
            <span v-for="(height, index) in tickerBars" :key="index" :style="{ height: `${height}%`, animationDelay: `${index * -0.11}s` }"></span>
          </div>

          <div class="monitor-footer">
            <span>FACE-API / TFJS</span>
            <span>ON-DEVICE</span>
          </div>
        </aside>
      </section>

      <section id="capture" class="studio-grid">
        <VisionStudio
          @emotion="handleEmotion"
          @status="handleStatus"
          @model="handleModel"
        />
        <EmotionPanel
          :result="emotionResult"
          :status="visionStatus"
          :model-info="modelInfo"
        />
      </section>

      <RecommendationDeck :emotion="emotionResult" @play="handlePlay" />

      <AlgorithmSection v-if="algorithmOpen" :model-info="modelInfo" @close="closeAlgorithm" />
    </main>

    <footer class="site-footer">
      <div class="footer-brand">
        <span class="brand-mark"><Icon name="wave" :size="18" /></span>
        <span><strong>MOODWAVE</strong> / 情绪声场</span>
      </div>
      <p>本地人脸情绪识别 · 多因子歌曲推荐 · Vue 3 + face-api.js</p>
      <button class="footer-top" @click="scrollTo('top')">回到顶部 <Icon name="arrowUpRight" :size="14" /></button>
    </footer>

    <PlayerBar :request="playRequest" />
  </div>
</template>
