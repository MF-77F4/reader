<template>
  <div v-if="isTauri" class="window-controls">
    <button class="window-button" type="button" aria-label="最小化" @click="minimizeWindow">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5h8" /></svg>
    </button>
    <button class="window-button" type="button" aria-label="最大化或还原" @click="toggleMaximizeWindow">
      <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7" rx="0.5" /></svg>
    </button>
    <button class="window-button close-button" type="button" aria-label="关闭" @click="closeWindow">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 2.5 7 7m0-7-7 7" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'

const isTauri = typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)

const minimizeWindow = async (): Promise<void> => {
  await getCurrentWindow().minimize()
}

const toggleMaximizeWindow = async (): Promise<void> => {
  await getCurrentWindow().toggleMaximize()
}

const closeWindow = async (): Promise<void> => {
  await getCurrentWindow().close()
}
</script>

<style scoped>
.window-controls {
  display: flex;
  height: 100%;
  margin-left: auto;
  -webkit-app-region: no-drag;
}

.window-button {
  display: grid;
  width: 46px;
  height: 100%;
  padding: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: #55565b;
}

.window-button:hover {
  background: rgba(0, 0, 0, 0.07);
}

.window-button.close-button:hover {
  background: #c42b1c;
  color: #fff;
}

.window-button svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
}
</style>
