<script setup>
import { computed } from 'vue'
import { EMOTIONS, EXPRESSION_LABELS } from '../data/emotions.js'
import Icon from './Icon.vue'

const props = defineProps({
  result: { type: Object, default: null },
  status: { type: Object, default: null },
  modelInfo: { type: Object, default: null },
})

const emotion = computed(() => EMOTIONS[props.result?.dominant] ?? EMOTIONS.neutral)
const confidencePercent = computed(() => Math.round((props.result?.confidence ?? 0) * 100))
const valencePercent = computed(() => Math.round(((props.result?.valence ?? 0) + 1) * 50))
const energyPercent = computed(() => Math.round((props.result?.energy ?? 0) * 100))
const statusPhase = computed(() => props.status?.phase ?? 'idle')
const activeBars = computed(() => {
  if (!props.result) return []
  return EXPRESSION_LABELS.map((item) => ({
    ...item,
    value: props.result.expressions[item.key] ?? 0,
    active: item.key === props.result.dominant,
  }))
})
const valenceLabel = computed(() => {
  const value = props.result?.valence ?? 0
  if (value > 0.35) return '正向'
  if (value < -0.35) return '负向'
  return '中性'
})
const energyLabel = computed(() => {
  const value = props.result?.energy ?? 0
  if (value > 0.68) return '高唤醒'
  if (value < 0.4) return '低唤醒'
  return '中等唤醒'
})
const isScene = computed(() => props.result?.method === 'scene')
</script>

<template>
  <section class="panel emotion-panel" :style="{ '--emotion-color': emotion.color, '--emotion-glow': emotion.glow }">
    <div class="panel-heading">
      <div>
        <span class="eyebrow">02 / AFFECT</span>
        <h2>读见情绪的纹理</h2>
      </div>
      <span class="live-status" :class="statusPhase">
        <i></i>
        {{ statusPhase === 'found' ? '实时输出' : statusPhase === 'scene' ? '色调推断' : statusPhase === 'no-face' ? '等待人脸' : statusPhase === 'error' ? '识别异常' : statusPhase === 'searching' ? '分析中' : '待机' }}
      </span>
    </div>

    <div v-if="!result" class="emotion-empty">
      <div class="empty-spectrum" aria-hidden="true">
        <span v-for="(item, index) in EXPRESSION_LABELS" :key="item.key" :style="{ height: `${18 + (index % 4) * 9}%`, background: item.color }"></span>
      </div>
      <h3>情绪还藏在画面里</h3>
      <p>上传照片、表情包或视频：先由 face-api 识别表情，没有脸时改用画面色调推断。</p>
      <div class="empty-formula">
        <span>FACE → 68 LANDMARKS</span>
        <i></i>
        <span>7D SOFTMAX</span>
        <i></i>
        <span>VALENCE / ENERGY</span>
      </div>
    </div>

    <template v-else>
      <div class="emotion-hero">
        <div class="emotion-title">
          <span class="emotion-kicker">
            {{ isScene ? 'SCENE MOOD · NO FACE' : 'DETECTED EMOTION' }}
          </span>
          <div class="emotion-name">
            <h3>{{ emotion.label }}</h3>
            <span>{{ emotion.en }}</span>
          </div>
          <p>{{ emotion.note }}</p>
          <span v-if="isScene" class="method-badge">画面色调推断</span>
        </div>

        <div class="confidence-wrap">
          <div
            class="confidence-ring"
            :style="{ background: `conic-gradient(${emotion.color} ${confidencePercent * 3.6}deg, rgba(255,255,255,.08) 0deg)` }"
          >
            <div class="confidence-hole">
              <strong>{{ confidencePercent }}</strong>
              <span>%</span>
            </div>
          </div>
          <span class="confidence-label">置信度</span>
        </div>
      </div>

      <div class="affect-grid">
        <div class="affect-card">
          <div class="affect-head">
            <span>情绪效价 <small>Valence</small></span>
            <strong>{{ props.result.valence > 0 ? '+' : '' }}{{ props.result.valence.toFixed(2) }}</strong>
          </div>
          <div class="bipolar-track">
            <span class="bipolar-zero"></span>
            <span class="bipolar-fill" :style="{ left: `${Math.min(50, valencePercent)}%`, width: `${Math.abs(valencePercent - 50)}%`, background: emotion.color }"></span>
            <span class="bipolar-dot" :style="{ left: `${valencePercent}%`, background: emotion.color }"></span>
          </div>
          <div class="affect-foot"><span>负向</span><span>{{ valenceLabel }}</span><span>正向</span></div>
        </div>

        <div class="affect-card">
          <div class="affect-head">
            <span>唤醒能量 <small>Arousal</small></span>
            <strong>{{ energyPercent }}%</strong>
          </div>
          <div class="energy-track">
            <span :style="{ width: `${energyPercent}%`, background: emotion.color }"></span>
          </div>
          <div class="affect-foot"><span>平静</span><span>{{ energyLabel }}</span><span>兴奋</span></div>
        </div>
      </div>

      <div v-if="isScene && result.palette?.length" class="scene-palette">
        <span class="scene-palette-label">主色权重</span>
        <span
          v-for="item in result.palette"
          :key="item.color"
          class="scene-swatch"
          :style="{ background: item.color, flexGrow: Math.max(1, item.ratio * 10) }"
          :title="`${item.color} · ${Math.round(item.ratio * 100)}%`"
        ></span>
        <span class="scene-palette-value">
          彩色 {{ Math.round(result.scene.coloredRatio * 100) }}% · 明度
          {{ Math.round(result.scene.brightness * 100) }}
        </span>
      </div>

      <div class="spectrum">
        <div class="spectrum-head">
          <span>{{ isScene ? '情绪概率分布' : '表情概率分布' }}</span>
          <span>{{ isScene ? 'HUE ANCHOR VOTE' : '7-CLASS SOFTMAX' }}</span>
        </div>
        <div
          v-for="item in activeBars"
          :key="item.key"
          class="spectrum-row"
          :class="{ active: item.active }"
        >
          <span class="spectrum-name" :style="{ color: item.active ? item.color : undefined }">
            {{ item.label }}
          </span>
          <div class="spectrum-track">
            <span
              class="spectrum-fill"
              :style="{ width: `${Math.max(2, item.value * 100)}%`, background: item.color }"
            ></span>
          </div>
          <span class="spectrum-value">{{ Math.round(item.value * 100) }}%</span>
        </div>
      </div>

      <div class="emotion-footer">
        <span class="signal-meta">
          <Icon name="wave" :size="14" />
          {{ isScene ? '色调采样 64×64' : props.result.stable ? '时序已稳定' : result.isSnapshot || result.singleFrame ? '单帧采样' : '信号收敛中' }}
        </span>
        <span v-if="isScene">
          对比 {{ Math.round(result.scene.contrast * 100) }} · 饱和
          {{ Math.round(result.scene.saturation * 100) }} · 暖度
          {{ result.scene.warmth > 0 ? '+' : '' }}{{ result.scene.warmth.toFixed(2) }}
        </span>
        <span v-else>
          样本 {{ result.frames }} 帧 · 人脸分 {{ Math.round(result.faceScore * 100) }}
          <template v-if="result.faceCount > 1"> · {{ result.faceCount }} 张人脸</template>
        </span>
      </div>

      <p v-if="statusPhase === 'no-face' && !isScene" class="panel-alert">
        当前画面未检测到人脸，已保留最近一次结果。请调整光线与角度。
      </p>
      <p v-else-if="isScene" class="algorithm-note">
        V = Σ w<sub>h</sub> · v<sub>h</sub> / Σ w<sub>h</sub> · E = A<sub>base</sub> + Δ对比 + Δ明度 · 色相 8 锚点
      </p>
      <p v-else class="algorithm-note">
        V = Σ p<sub>i</sub> · v<sub>i</sub> · E = Σ p<sub>i</sub> · a<sub>i</sub> · 时序 α = 0.35
      </p>
    </template>
  </section>
</template>
