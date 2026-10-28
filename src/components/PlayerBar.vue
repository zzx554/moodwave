<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import Icon from './Icon.vue'
import TrackCover from './TrackCover.vue'

const props = defineProps({
  request: { type: Object, default: null },
})

const audioEl = ref(null)
const current = ref(null)
const queue = ref([])
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(0.72)
const muted = ref(false)
const errorMessage = ref('')
const isLoading = ref(false)

const progress = computed(() => (duration.value ? (currentTime.value / duration.value) * 100 : 0))
const sourceLabel = computed(() => {
  const source = current.value?.source
  if (source === 'netease') return '网易云音乐'
  if (source === 'online') return '在线试听'
  return '本地播放'
})

const bars = [0.36, 0.72, 0.48, 0.9, 0.58, 0.78, 0.42, 0.64, 0.34, 0.84, 0.52, 0.7, 0.44, 0.6]

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return '0:00'
  const minutes = Math.floor(value / 60)
  const seconds = Math.floor(value % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

async function selectTrack(track, autoplay = true) {
  if (!track) return
  current.value = track
  errorMessage.value = ''
  isLoading.value = true
  currentTime.value = 0
  duration.value = 0

  await nextTick()
  const audio = audioEl.value
  if (!audio) return
  audio.src = track.src
  audio.load()
  audio.volume = muted.value ? 0 : volume.value
  if (autoplay) {
    try {
      await audio.play()
    } catch (error) {
      errorMessage.value = '播放被浏览器阻止，请再次点击播放按钮。'
      isLoading.value = false
    }
  }
}

function togglePlay() {
  const audio = audioEl.value
  if (!audio) return
  if (!current.value) return
  if (audio.paused) {
    audio.play().catch(() => {
      errorMessage.value = '该音频暂时无法播放，请切换歌曲重试。'
    })
  } else {
    audio.pause()
  }
}

function playOffset(direction) {
  if (!queue.value.length) return
  const index = queue.value.findIndex((item) => item.id === current.value?.id)
  const nextIndex = index === -1 ? 0 : (index + direction + queue.value.length) % queue.value.length
  selectTrack(queue.value[nextIndex])
}

function playNext() {
  playOffset(1)
}

function playPrevious() {
  playOffset(-1)
}

function handleTimeUpdate() {
  const audio = audioEl.value
  if (!audio) return
  currentTime.value = audio.currentTime
  if (Number.isFinite(audio.duration)) duration.value = audio.duration
}

function handleLoadedMetadata() {
  const audio = audioEl.value
  if (!audio) return
  duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
  isLoading.value = false
  errorMessage.value = ''
}

function handleSeek(event) {
  const audio = audioEl.value
  if (!audio) return
  const nextTime = Number(event.target.value)
  if (Number.isFinite(nextTime)) {
    audio.currentTime = nextTime
    currentTime.value = nextTime
  }
}

function handleVolume(event) {
  const nextVolume = Number(event.target.value)
  volume.value = nextVolume
  muted.value = nextVolume === 0
  if (audioEl.value) audioEl.value.volume = nextVolume
}

function toggleMute() {
  muted.value = !muted.value
  if (audioEl.value) audioEl.value.volume = muted.value ? 0 : volume.value
}

function handleEnded() {
  if (queue.value.length > 1) playNext()
}

function handleError() {
  isLoading.value = false
  errorMessage.value = '音频加载失败，请检查本地文件或在线试听地址。'
}

watch(
  () => props.request?.nonce,
  async () => {
    if (!props.request?.track) return
    queue.value = props.request.queue?.length ? props.request.queue : [props.request.track]
    await selectTrack(props.request.track)
  },
  { immediate: true }
)

onMounted(() => {
  if (audioEl.value) audioEl.value.volume = volume.value
})
</script>

<template>
  <div class="player-shell" :class="{ 'has-track': current }">
    <audio
      ref="audioEl"
      preload="metadata"
      @play="isPlaying = true"
      @pause="isPlaying = false"
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMetadata"
      @waiting="isLoading = true"
      @playing="isLoading = false"
      @ended="handleEnded"
      @error="handleError"
    ></audio>

    <div class="player-progress">
      <input
        type="range"
        min="0"
        :max="duration || 0"
        step="0.1"
        :value="currentTime"
        :style="{ '--range-progress': `${progress}%` }"
        :disabled="!current"
        aria-label="播放进度"
        @input="handleSeek"
      />
    </div>

    <div class="player-main">
      <div class="player-track">
        <template v-if="current">
          <TrackCover :track="current" size="sm" />
          <div class="player-copy">
            <div class="player-title-line">
              <strong>{{ current.title }}</strong>
              <span class="player-source">{{ sourceLabel }}</span>
            </div>
            <span>{{ current.artist }} · {{ current.album }}</span>
          </div>
        </template>
        <template v-else>
          <div class="player-placeholder-cover">
            <Icon name="music" :size="18" />
          </div>
          <div class="player-copy">
            <strong>选择一首歌，开始播放</strong>
            <span>本地曲库 / 在线试听</span>
          </div>
        </template>
      </div>

      <div class="player-controls">
        <button class="player-skip" :disabled="!current" title="上一首" @click="playPrevious">
          <Icon name="skipBack" :size="16" />
        </button>
        <button class="player-toggle" :disabled="!current" :title="isPlaying ? '暂停' : '播放'" @click="togglePlay">
          <span v-if="isLoading && current" class="mini-loader"></span>
          <Icon v-else :name="isPlaying ? 'pause' : 'play'" :size="18" />
        </button>
        <button class="player-skip" :disabled="!current" title="下一首" @click="playNext">
          <Icon name="skipForward" :size="16" />
        </button>
        <span class="player-time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
      </div>

      <div class="player-right">
        <div class="mini-wave" :class="{ playing: isPlaying }" aria-hidden="true">
          <span v-for="(height, index) in bars" :key="index" :style="{ height: `${height * 100}%`, animationDelay: `${index * -0.08}s` }"></span>
        </div>
        <button class="volume-button" title="静音" @click="toggleMute">
          <Icon :name="muted || volume === 0 ? 'volumeMute' : 'volume2'" :size="17" />
        </button>
        <input
          class="volume-range"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="muted ? 0 : volume"
          aria-label="音量"
          @input="handleVolume"
        />
      </div>
    </div>

    <p v-if="errorMessage" class="player-error">{{ errorMessage }}</p>
  </div>
</template>
