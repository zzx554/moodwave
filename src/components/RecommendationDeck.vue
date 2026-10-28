<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EMOTIONS } from '../data/emotions.js'
import { LOCAL_TRACKS } from '../data/tracks.js'
import { fetchOnlineTracks, getQueryMeta, getQueryVariantCount } from '../lib/itunes.js'
import {
  fetchNeteaseTracks,
  getNeteaseQueryMeta,
  getNeteaseVariantCount,
} from '../lib/netease.js'
import {
  RECOMMEND_WEIGHTS,
  STRATEGY_META,
  getRecommendationTarget,
  pickLocalTracks,
} from '../lib/recommender.js'
import Icon from './Icon.vue'
import TrackCover from './TrackCover.vue'

const props = defineProps({
  emotion: { type: Object, default: null },
})
const emit = defineEmits(['play'])

const strategy = ref('regulate')
const activeTab = ref('local')
const localVariant = ref(0)

// iTunes 在线源
const itunesTracks = ref([])
const itunesState = ref('idle')
const itunesError = ref('')
const itunesKey = ref('')
const itunesVariant = ref(0)

// 网易云在线源
const neteaseTracks = ref([])
const neteaseState = ref('idle')
const neteaseError = ref('')
const neteaseKey = ref('')
const neteaseVariant = ref(0)
const neteaseNotice = ref('')

let itunesController = null
let neteaseController = null

const dominant = computed(() => props.emotion?.dominant ?? 'neutral')
const emotionMeta = computed(() => EMOTIONS[dominant.value] ?? EMOTIONS.neutral)
const target = computed(() => getRecommendationTarget(dominant.value, strategy.value))
const weights = computed(() => RECOMMEND_WEIGHTS[strategy.value])
const localTracks = computed(() => {
  if (!props.emotion) return []
  const base = pickLocalTracks(LOCAL_TRACKS, dominant.value, strategy.value, 8)
  if (!localVariant.value || base.length <= 2) return base
  // 「换一批」只轮换除最佳匹配之外的曲目，保证首推依旧最贴合
  const tail = base.slice(1)
  const shift = localVariant.value % tail.length
  return [base[0], ...tail.slice(shift), ...tail.slice(0, shift)]
})
const currentKey = computed(() => `${dominant.value}-${strategy.value}`)
const itunesQueryMeta = computed(() => getQueryMeta(dominant.value, strategy.value, itunesVariant.value))
const neteaseQueryMeta = computed(() => getNeteaseQueryMeta(dominant.value, strategy.value, neteaseVariant.value))
const activeQueue = computed(() => {
  if (activeTab.value === 'netease') return neteaseTracks.value
  if (activeTab.value === 'itunes') return itunesTracks.value
  return localTracks.value
})
const featured = computed(() => activeQueue.value[0] ?? null)
const restTracks = computed(() => activeQueue.value.slice(1, 7))
const isLoadingActive = computed(() => {
  if (activeTab.value === 'netease') return neteaseState.value === 'loading'
  if (activeTab.value === 'itunes') return itunesState.value === 'loading'
  return false
})
const activeError = computed(() => {
  if (activeTab.value === 'netease') return neteaseError.value
  if (activeTab.value === 'itunes') return itunesError.value
  return ''
})
const featuredSourceLine = computed(() => {
  if (activeTab.value === 'netease') return 'NETEASE MUSIC'
  if (activeTab.value === 'itunes') return 'APPLE MUSIC PREVIEW'
  return '离线收藏'
})
const externalTitle = computed(() =>
  activeTab.value === 'netease' ? '在网易云音乐查看' : '在 Apple Music 查看'
)
const noticeText = computed(() => neteaseNotice.value)
const targetDescription = computed(() => {
  const valence = target.value.valence
  return `目标效价 ${valence > 0 ? '+' : ''}${valence.toFixed(2)} · 目标能量 ${Math.round(target.value.energy * 100)}%`
})

watch(currentKey, () => {
  // 每次情绪或策略变化时随机换一组在线检索词，避免反复看到同一批结果
  itunesVariant.value = Math.floor(Math.random() * getQueryVariantCount(dominant.value, strategy.value))
  neteaseVariant.value = Math.floor(Math.random() * getNeteaseVariantCount(dominant.value, strategy.value))
  localVariant.value = 0
  itunesTracks.value = []
  itunesKey.value = ''
  neteaseTracks.value = []
  neteaseKey.value = ''
  neteaseState.value = 'idle'
  neteaseError.value = ''
  neteaseNotice.value = ''
  loadActive()
})

watch(activeTab, () => {
  loadActive()
})

onBeforeUnmount(() => {
  itunesController?.abort()
  neteaseController?.abort()
})

function loadActive() {
  if (!props.emotion) return
  if (activeTab.value === 'netease') loadNetease()
  else if (activeTab.value === 'itunes') loadItunes()
}

async function loadNetease(force = false) {
  if (!props.emotion || activeTab.value !== 'netease') return
  const key = currentKey.value
  if (!force && neteaseKey.value === key && neteaseTracks.value.length) return
  neteaseController?.abort()
  neteaseController = new AbortController()
  neteaseState.value = 'loading'
  neteaseError.value = ''
  try {
    const tracks = await fetchNeteaseTracks({
      emotion: dominant.value,
      strategy: strategy.value,
      variant: neteaseVariant.value,
      signal: neteaseController.signal,
    })
    neteaseTracks.value = tracks
    neteaseKey.value = key
    neteaseState.value = 'ready'
    neteaseNotice.value = ''
  } catch (error) {
    if (error?.name === 'AbortError') return
    neteaseState.value = 'error'
    neteaseError.value = error?.message || '网易云曲库暂时不可用'
    // 网易云不可达时自动回退到 iTunes，保证在线推荐始终可用
    neteaseNotice.value = '网易云曲库当前不可达，已自动切换到 iTunes 在线试听'
    activeTab.value = 'itunes'
  }
}

async function loadItunes(force = false) {
  if (!props.emotion || activeTab.value !== 'itunes') return
  const key = currentKey.value
  if (!force && itunesKey.value === key && itunesTracks.value.length) return
  itunesController?.abort()
  itunesController = new AbortController()
  itunesState.value = 'loading'
  itunesError.value = ''
  try {
    const tracks = await fetchOnlineTracks({
      emotion: dominant.value,
      strategy: strategy.value,
      variant: itunesVariant.value,
      signal: itunesController.signal,
    })
    itunesTracks.value = tracks
    itunesKey.value = key
    itunesState.value = 'ready'
  } catch (error) {
    if (error?.name === 'AbortError') return
    itunesState.value = 'error'
    itunesError.value = error?.message || '在线推荐暂时不可用'
  }
}

function refreshActive() {
  if (!props.emotion) return
  if (activeTab.value === 'local') {
    localVariant.value += 1
    return
  }
  if (activeTab.value === 'netease') {
    neteaseVariant.value += 1
    neteaseTracks.value = []
    neteaseKey.value = ''
    neteaseNotice.value = ''
    loadNetease(true)
    return
  }
  itunesVariant.value += 1
  itunesTracks.value = []
  itunesKey.value = ''
  loadItunes(true)
}

function reloadActive() {
  if (activeTab.value === 'netease') loadNetease(true)
  else loadItunes(true)
}

function setStrategy(next) {
  strategy.value = next
}

function play(track) {
  emit('play', { track, queue: activeQueue.value, source: activeTab.value })
}

function scoreLabel(score) {
  return Math.round(score)
}
</script>

<template>
  <section id="recommend" class="panel recommend-panel">
    <div class="recommend-heading">
      <div class="heading-copy">
        <span class="eyebrow">03 / RECOMMEND</span>
        <h2>让音乐接住情绪</h2>
        <p>基于效价、能量与情绪标签的多因子排序，离线曲库与在线试听同步生成。</p>
      </div>

      <div class="strategy-switch" :class="{ disabled: !emotion }">
        <button
          v-for="(item, key) in STRATEGY_META"
          :key="key"
          :class="{ active: strategy === key }"
          :disabled="!emotion"
          @click="setStrategy(key)"
        >
          {{ item.short }}
        </button>
      </div>
    </div>

    <div v-if="!emotion" class="recommend-empty">
      <div class="empty-wave">
        <span v-for="n in 22" :key="n" :style="{ height: `${12 + ((n * 17) % 48)}%` }"></span>
      </div>
      <div>
        <h3>等待一段情绪信号</h3>
        <p>完成一次人脸识别后，系统会按“{{ STRATEGY_META[strategy].label }}”策略生成专属歌单。</p>
      </div>
    </div>

    <template v-else>
      <div class="recommend-context">
        <div class="context-emotion" :style="{ '--accent': emotionMeta.color }">
          <span class="context-dot"></span>
          <strong>{{ emotionMeta.label }}</strong>
          <span>{{ targetDescription }}</span>
        </div>
        <p>{{ STRATEGY_META[strategy].description }}</p>
        <div class="context-formula">
          <span>SCORE</span>
          <span>{{ Math.round(weights.valence * 100) }}% 效价</span>
          <span>+ {{ Math.round(weights.energy * 100) }}% 能量</span>
          <span>+ {{ Math.round(weights.mood * 100) }}% 标签</span>
          <span>+ {{ Math.round(weights.quality * 100) }}% 品质</span>
        </div>
      </div>

      <div class="library-bar">
        <div class="library-tabs">
          <button :class="{ active: activeTab === 'local' }" @click="activeTab = 'local'">
            离线曲库
            <span>{{ LOCAL_TRACKS.length }}</span>
          </button>
          <button :class="{ active: activeTab === 'netease' }" @click="activeTab = 'netease'">
            网易云音乐
            <span class="online-badge">NETEASE</span>
          </button>
          <button :class="{ active: activeTab === 'itunes' }" @click="activeTab = 'itunes'">
            iTunes
            <span class="online-badge">iTunes</span>
          </button>
        </div>
        <div class="library-actions">
          <span v-if="activeTab === 'local'" class="library-note">
            <Icon name="check" :size="13" /> 已下载至本地 /music
          </span>
          <span v-else-if="activeTab === 'netease'" class="library-note">
            <Icon name="wave" :size="13" /> {{ neteaseQueryMeta.label }} · 网易云曲库
          </span>
          <span v-else class="library-note">
            <Icon name="wave" :size="13" /> {{ itunesQueryMeta.label }} · 30 秒试听
          </span>
          <button
            class="refresh-chip"
            :class="{ 'is-loading': isLoadingActive }"
            :title="activeTab === 'local' ? '换一批本地曲目' : activeTab === 'netease' ? '重新检索网易云曲库' : '换一批在线推荐'"
            :disabled="isLoadingActive"
            @click="refreshActive()"
          >
            <Icon name="refresh" :size="13" />
            换一批
          </button>
        </div>
      </div>

      <p v-if="noticeText" class="source-notice">
        <Icon name="wave" :size="13" />
        {{ noticeText }}
      </p>

      <div v-if="isLoadingActive" class="track-loading">
        <div v-for="n in 5" :key="n" class="skeleton-row">
          <span class="skeleton skeleton-cover"></span>
          <div class="skeleton-copy">
            <span class="skeleton skeleton-title"></span>
            <span class="skeleton skeleton-sub"></span>
          </div>
          <span class="skeleton skeleton-score"></span>
        </div>
      </div>

      <div v-else-if="activeError" class="online-error">
        <Icon name="info" :size="20" />
        <div>
          <h3>{{ activeTab === 'netease' ? '网易云曲库没有回应' : '在线推荐没有回应' }}</h3>
          <p>{{ activeError }}。你仍可使用完整的离线曲库。</p>
        </div>
        <button class="button button-ghost" @click="reloadActive()">重新连接</button>
      </div>

      <div v-else class="track-list">
        <article v-if="featured" class="featured-track" @click="play(featured)">
          <div class="featured-art">
            <TrackCover :track="featured" size="lg" />
            <span class="best-badge">
              <Icon name="spark" :size="12" />
              BEST MATCH
            </span>
          </div>
          <div class="featured-copy">
            <div class="track-topline">
              <span>{{ featuredSourceLine }} · {{ featured.genre }}</span>
              <span>{{ featured.bpm ? `${featured.bpm} BPM` : 'ONLINE' }}</span>
            </div>
            <h3>{{ featured.title }}</h3>
            <p>{{ featured.artist }} <span>·</span> {{ featured.album }}</p>
            <div class="reason-list">
              <span v-for="reason in featured.reasons" :key="reason">{{ reason }}</span>
            </div>
            <div class="featured-bottom">
              <div class="match-score">
                <span class="score-number">{{ scoreLabel(featured.score) }}</span>
                <span class="score-caption">MATCH SCORE</span>
                <span class="score-meter"><i :style="{ width: `${featured.score}%` }"></i></span>
              </div>
              <button class="play-button" @click.stop="play(featured)">
                <Icon name="play" :size="16" />
                播放
              </button>
            </div>
          </div>
          <span class="featured-index">01</span>
        </article>

        <article
          v-for="(track, index) in restTracks"
          :key="track.id"
          class="track-row"
          @click="play(track)"
        >
          <span class="row-index">{{ String(index + 2).padStart(2, '0') }}</span>
          <TrackCover :track="track" size="sm" />
          <div class="row-copy">
            <h4>{{ track.title }}</h4>
            <p>{{ track.artist }} <span>·</span> {{ track.album }}</p>
          </div>
          <div class="row-tags">
            <span v-for="tag in track.tags.slice(0, 2)" :key="tag">{{ tag }}</span>
          </div>
          <div class="row-score">
            <span class="score-bar"><i :style="{ width: `${track.score}%`, background: emotionMeta.color }"></i></span>
            <strong>{{ scoreLabel(track.score) }}</strong>
          </div>
          <button class="row-play" :aria-label="`播放 ${track.title}`" @click.stop="play(track)">
            <Icon name="play" :size="13" />
          </button>
          <a
            v-if="track.externalUrl"
            class="row-link"
            :href="track.externalUrl"
            target="_blank"
            rel="noreferrer"
            :title="externalTitle"
            @click.stop
          >
            <Icon name="arrowUpRight" :size="14" />
          </a>
        </article>
      </div>

      <div class="recommend-footer">
        <span v-if="activeTab === 'local'">
          离线曲目来源：SoundHelix 免费示例音乐（T. Schürger），已保存至 <code>public/music</code>。
        </span>
        <span v-else-if="activeTab === 'netease'">
          在线曲目来自网易云音乐曲库（构建时同步快照），播放为网易云外链音源，版权归原作者所有。
        </span>
        <span v-else>
          在线曲目来自 Apple iTunes Search API，播放为 30 秒官方试听片段，版权归原作者所有。
        </span>
        <span class="recommend-source">
          {{ activeTab === 'local' ? 'LOCAL LIBRARY' : activeTab === 'netease' ? 'NETEASE API' : 'ITUNES API' }}
        </span>
      </div>
    </template>
  </section>
</template>
