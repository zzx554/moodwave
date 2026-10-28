<script setup>
const props = defineProps({
  track: { type: Object, required: true },
  size: { type: String, default: 'md' },
})
</script>

<template>
  <div
    class="track-cover"
    :class="[`is-${size}`, { 'has-artwork': props.track.artwork }]"
    :style="props.track.artwork ? {} : { background: props.track.cover?.background, color: props.track.cover?.ink }"
  >
    <img
      v-if="props.track.artwork"
      :src="props.track.artwork"
      :alt="`${props.track.title} 封面`"
      loading="lazy"
    />
    <template v-else>
      <span class="cover-ring ring-a"></span>
      <span class="cover-ring ring-b"></span>
      <span class="cover-mark">{{ props.track.cover?.mark }}</span>
      <span class="cover-label">MOODWAVE</span>
    </template>
  </div>
</template>

<style scoped>
.track-cover {
  position: relative;
  flex: none;
  overflow: hidden;
  border-radius: 14px;
  isolation: isolate;
}

.track-cover::after {
  position: absolute;
  inset: 0;
  content: '';
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.28'/%3E%3C/svg%3E");
  opacity: 0.22;
  mix-blend-mode: soft-light;
  pointer-events: none;
}

.track-cover.is-xs {
  width: 34px;
  height: 34px;
  border-radius: 9px;
}

.track-cover.is-sm {
  width: 46px;
  height: 46px;
  border-radius: 11px;
}

.track-cover.is-md {
  width: 58px;
  height: 58px;
}

.track-cover.is-lg {
  width: 72px;
  height: 72px;
  border-radius: 18px;
}

.track-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-ring {
  position: absolute;
  border: 1px solid currentColor;
  border-radius: 50%;
  opacity: 0.3;
}

.ring-a {
  width: 88%;
  height: 88%;
  right: -28%;
  bottom: -24%;
}

.ring-b {
  width: 48%;
  height: 48%;
  left: 12%;
  top: 12%;
  opacity: 0.18;
}

.cover-mark {
  position: absolute;
  right: 9%;
  bottom: 3%;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 500;
  line-height: 1;
  letter-spacing: -0.04em;
  opacity: 0.88;
}

.is-lg .cover-mark {
  font-size: 26px;
}

.is-xs .cover-mark,
.is-sm .cover-mark {
  display: none;
}

.cover-label {
  position: absolute;
  left: 10%;
  top: 9%;
  font-size: 5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  opacity: 0.55;
}

.is-xs .cover-label,
.is-sm .cover-label {
  display: none;
}
</style>
