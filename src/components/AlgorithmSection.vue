<script setup>
import { EMOTIONS, EMOTION_ORDER } from '../data/emotions.js'
import { HUE_ANCHORS } from '../lib/sceneMood.js'
import Icon from './Icon.vue'

defineProps({
  modelInfo: { type: Object, default: null },
})

const emit = defineEmits(['close'])
</script>

<template>
  <section id="algorithm" class="algorithm-section">
    <button class="algorithm-collapse" type="button" @click="emit('close')">
      收起算法说明
      <Icon name="chevronDown" :size="14" />
    </button>
    <div class="algorithm-heading">
      <div>
        <span class="eyebrow">04 / METHOD</span>
        <h2>算法不是黑箱</h2>
      </div>
      <p>
        情绪识别、情绪量化与歌曲排序全部在浏览器端完成。模型权重、离线曲目和推荐参数均存放于项目本地。
      </p>
    </div>

    <div class="pipeline-strip">
      <div class="pipeline-node">
        <span>INPUT</span>
        <strong>图片 / 视频 / 摄像头</strong>
        <small>帧采样 · 900ms</small>
      </div>
      <i class="pipeline-arrow"></i>
      <div class="pipeline-node">
        <span>DETECT</span>
        <strong>TinyFaceDetector</strong>
        <small>SSD MobileNetV1 · 416²</small>
      </div>
      <i class="pipeline-arrow"></i>
      <div class="pipeline-node">
        <span>ALIGN</span>
        <strong>68 Landmarks</strong>
        <small>FaceLandmark68Tiny</small>
      </div>
      <i class="pipeline-arrow"></i>
      <div class="pipeline-node accent">
        <span>INFER</span>
        <strong>FaceExpressionNet</strong>
        <small>7 类 softmax</small>
      </div>
      <i class="pipeline-arrow"></i>
      <div class="pipeline-node">
        <span>RANK</span>
        <strong>Multi-factor Score</strong>
        <small>本地 + 在线曲库</small>
      </div>
    </div>

    <div class="algorithm-grid">
      <article class="algo-card wide">
        <div class="algo-card-head">
          <span class="algo-index">01</span>
          <div>
            <span class="algo-kicker">LOCAL VISION</span>
            <h3>本地人脸与表情推理</h3>
          </div>
          <span class="local-chip"><i></i> 100% 本地</span>
        </div>
        <ol class="algo-steps">
          <li>
            <strong>人脸检测</strong>
            <p>
              使用 TinyFaceDetector（SSD MobileNetV1）在 416×416 输入上预测人脸框与置信度，
              通过 NMS 去重，只保留面积最大的主脸，检测阈值 0.5。
            </p>
          </li>
          <li>
            <strong>关键点对齐</strong>
            <p>
              FaceLandmark68TinyNet 输出 68 个面部关键点，用于定位五官区域并绘制识别框；
              表情网络输入同一张人脸的归一化裁切区域。
            </p>
          </li>
          <li>
            <strong>表情分类</strong>
            <p>
              FaceExpressionNet 输出 7 类概率：快乐、平静、惊讶、悲伤、愤怒、恐惧、厌恶。
              对概率做归一化后得到本次采样向量 <code>p = [p₁ … p₇]</code>。
            </p>
          </li>
          <li>
            <strong>时序平滑</strong>
            <p>
              视频与摄像头每隔约 900ms 采样一次，使用指数滑动平均抑制抖动：
              <code>p̄t = 0.35 · pt + 0.65 · p̄t−1</code>。置信度为
              <code>max(p̄) × faceScore</code>。
            </p>
          </li>
        </ol>
        <div class="model-files">
          <span>本地模型路径</span>
          <code>public/models/</code>
          <span>推理后端</span>
          <code>{{ modelInfo?.backend || 'WebGL / CPU' }}</code>
          <span>模型</span>
          <code>tiny_face_detector · face_landmark_68_tiny · face_expression</code>
        </div>
      </article>

      <article class="algo-card">
        <div class="algo-card-head">
          <span class="algo-index">02</span>
          <div>
            <span class="algo-kicker">AFFECT MODEL</span>
            <h3>从概率到情绪坐标</h3>
          </div>
        </div>
        <div class="formula-block">
          <span>V = Σ p̄ᵢ · valenceᵢ</span>
          <span>E = Σ p̄ᵢ · arousalᵢ</span>
        </div>
        <div class="emotion-weight-table">
          <div
            v-for="key in EMOTION_ORDER"
            :key="key"
            class="weight-row"
            :style="{ '--row-color': EMOTIONS[key].color }"
          >
            <span class="weight-name">
              <i class="weight-dot"></i>
              {{ EMOTIONS[key].label }}
            </span>
            <span>{{ EMOTIONS[key].valence > 0 ? '+' : '' }}{{ EMOTIONS[key].valence.toFixed(2) }}</span>
            <span>{{ EMOTIONS[key].arousal.toFixed(2) }}</span>
          </div>
          <div class="weight-head">
            <span>表情</span>
            <span>效价</span>
            <span>唤醒</span>
          </div>
        </div>
        <p class="algo-note">效价范围 −1 到 +1，唤醒范围 0 到 1，共同组成情绪二维坐标。</p>
      </article>

      <article class="algo-card">
        <div class="algo-card-head">
          <span class="algo-index">02B</span>
          <div>
            <span class="algo-kicker">SCENE MOOD</span>
            <h3>没有脸，也能读情绪</h3>
          </div>
        </div>
        <p class="algo-note">
          图片或视频里没有检出人脸时（表情包、插画、海报、风景），自动切换到画面色调推断：
          本地 canvas 采样，不加载额外模型，直接给出情绪坐标。
        </p>
        <div class="formula-stack">
          <div>
            <span>采样</span>
            <code>canvas 64×64 · 逐像素 RGB → HSL（跳过透明像素）</code>
          </div>
          <div>
            <span>色相投票</span>
            <code>8 锚点 × 饱和度权重（饱和 &lt; 0.25 计入中性，权重 0.10）</code>
          </div>
          <div>
            <span>效价</span>
            <code>V = Σ w<sub>h</sub>·v<sub>h</sub> / Σ w<sub>h</sub> + 0.20·Δ主体明度</code>
          </div>
          <div>
            <span>唤醒</span>
            <code>E = A<sub>base</sub> + 0.18·Δ对比 + 0.15·Δ主体明度</code>
          </div>
        </div>
        <div class="emotion-weight-table">
          <div
            v-for="anchor in HUE_ANCHORS"
            :key="anchor.hex"
            class="weight-row"
            :style="{ '--row-color': anchor.hex }"
          >
            <span class="weight-name">
              <i class="weight-dot"></i>
              {{ anchor.label }}
            </span>
            <span>{{ anchor.valence > 0 ? '+' : '' }}{{ anchor.valence.toFixed(2) }}</span>
            <span>{{ anchor.arousal.toFixed(2) }}</span>
          </div>
          <div class="weight-head">
            <span>主色相</span>
            <span>效价</span>
            <span>唤醒</span>
          </div>
        </div>
        <p class="algo-note">
          再由同一套情绪坐标反推 7 类概率（距离 softmax，温度 0.45），保证推荐链路与面部识别完全一致。
          该模式是色彩语义近似，结果会标注「画面色调推断」。
        </p>
      </article>

      <article class="algo-card">
        <div class="algo-card-head">
          <span class="algo-index">03</span>
          <div>
            <span class="algo-kicker">RANKING</span>
            <h3>多因子歌曲排序</h3>
          </div>
        </div>
        <div class="formula-stack">
          <div>
            <span>效价贴合</span>
            <code>1 − |V_song − V_target| / 2</code>
          </div>
          <div>
            <span>能量贴合</span>
            <code>1 − |E_song − E_target|</code>
          </div>
          <div>
            <span>标签贴合</span>
            <code>命中 1 · 邻近 0.62 · 其他 0.22</code>
          </div>
          <div>
            <span>品质项</span>
            <code>0.4 + 0.6 × popularity</code>
          </div>
        </div>
        <div class="score-formula">
          <span>SCORE =</span>
          <code>w<sub>v</sub>·ValenceFit + w<sub>e</sub>·EnergyFit + w<sub>m</sub>·MoodFit + w<sub>q</sub>·QualityFit</code>
        </div>
        <div class="weight-chips">
          <div>
            <strong>共鸣模式</strong>
            <span>42% / 26% / 22% / 10%</span>
          </div>
          <div>
            <strong>调节模式</strong>
            <span>52% / 30% / 10% / 8%</span>
          </div>
        </div>
        <p class="algo-note">
          离线曲库先按情绪相关度筛选（标签命中 / 邻近，或分数落在最优曲目 12 分内）再降序；
          在线结果每个艺人最多保留 2 首，避免同质化。
        </p>
      </article>
    </div>

    <div class="recommendation-method">
      <div class="method-copy">
        <span class="eyebrow">05 / TARGET</span>
        <h3>两种策略，两种情绪目标</h3>
        <p>
          “情绪调节”把目标效价推向更舒适区间，让音乐承担情绪转场；“情绪共鸣”贴近当前情绪坐标，
          先提供理解与陪伴。目标值参与上方同一套评分公式。
        </p>
        <div class="method-legend">
          <span><i class="legend-dot resonate"></i> 共鸣目标</span>
          <span><i class="legend-dot regulate"></i> 调节目标</span>
        </div>
      </div>
      <div class="target-table">
        <div class="target-head">
          <span>当前情绪</span>
          <span>共鸣 · V/E</span>
          <span>调节 · V/E</span>
        </div>
        <div v-for="key in EMOTION_ORDER" :key="key" class="target-row">
          <span class="target-emotion" :style="{ color: EMOTIONS[key].color }">
            <i :style="{ background: EMOTIONS[key].color }"></i>
            {{ EMOTIONS[key].label }}
          </span>
          <span>{{ EMOTIONS[key].target.resonate.valence.toFixed(2) }} / {{ EMOTIONS[key].target.resonate.energy.toFixed(2) }}</span>
          <span>{{ EMOTIONS[key].target.regulate.valence.toFixed(2) }} / {{ EMOTIONS[key].target.regulate.energy.toFixed(2) }}</span>
        </div>
      </div>
    </div>

    <div class="api-method">
      <div class="api-icon"><Icon name="wave" :size="22" /></div>
      <div>
        <span class="algo-kicker">ONLINE SOURCE</span>
        <h3>在线歌曲 API</h3>
        <p>
          在线推荐优先通过网易云音乐检索接口（经本地代理转发）按情绪与策略用中文关键词检索，
          再进入同一排序公式；网易云不可达时自动回退 iTunes Search API。结果缓存 10 分钟，
          播放地址经本地代理转发网易云外链音源。
        </p>
        <code>GET /api/netease/search/get/web?s=&lt;emotion-query&gt;&amp;type=1</code>
        <code>https://itunes.apple.com/search?term=&lt;emotion-query&gt;&amp;media=music&amp;entity=song</code>
      </div>
      <div class="api-stats">
        <div><strong>10</strong><span>本地曲目</span></div>
        <div><strong>7</strong><span>情绪类别</span></div>
        <div><strong>3</strong><span>本地模型</span></div>
      </div>
    </div>
  </section>
</template>
