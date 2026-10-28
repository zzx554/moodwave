<script setup>
const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 18 },
})

const icons = {
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M17 3v18M3 7h4M3 17h4M17 7h4M17 17h4"/>',
  aperture: '<circle cx="12" cy="12" r="9"/><path d="m14.31 8 5.74 9.94M9.69 8h11.48M7.38 12l5.74-9.94M9.69 16 3.95 6.06M14.31 16H2.83M16.62 12l-5.74 9.94"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.4L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.4L3 16"/><path d="M3 21v-5h5"/>',
  play: '<path fill="currentColor" stroke="none" d="M8 5v14l11-7z"/>',
  pause: '<path fill="currentColor" stroke="none" d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  skipBack: '<path fill="currentColor" stroke="none" d="M6 5h2v14H6zM20 5v14L9 12z"/>',
  skipForward: '<path fill="currentColor" stroke="none" d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a9 9 0 0 1 0 12"/>',
  volumeMute: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m16 9 5 5M21 9l-5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  wave: '<path d="M3 12h2l2-7 3 14 4-18 3 16 2-9h2"/>',
  spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M5 17.5 6 20l2.5 1-2.5 1L5 24"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  filmPlay: '<rect width="18" height="18" x="3" y="3" rx="2"/><path fill="currentColor" stroke="none" d="M10 8.5v7l6-3.5z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  volume2: '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="icons[props.name] || icons.spark"
  />
</template>
