<!-- src/renderer/src/components/reader/ReaderBottomBar.vue -->
<!-- 阅读页底部工具栏组件，包含章节导航、进度控制、夜间模式切换和高级设置 -->
<template>
  <transition name="slide-bottom">
    <!-- 🌟 动态注入夜间模式类名，保证内部样式完美继承 -->
    <div
      v-if="isToolbarVisible"
      class="reader-toolbar bottom-toolbar"
      :class="{ 'is-night-mode': readerSettings.isNight }"
      @click.stop="$emit('close-menus')"
      @mousedown.stop
      @mouseup.stop
    >
      <div class="toolbar-inner">
        <button class="icon-btn" @click="isSidebarOpen = !isSidebarOpen">
          <span class="btn-emoji">☰</span>
          <span class="btn-text">目录</span>
        </button>

        <div class="progress-control-area">
          <button class="icon-btn compact-btn" @click="$emit('prev-chapter')">
            <span class="btn-emoji">&lt;</span>
            <span class="btn-text">上一章</span>
          </button>

          <div class="slider-wrapper progress-slider-wrapper">
            <input
              type="range"
              class="apple-slider"
              min="0"
              max="100"
              step="0.1"
              v-model.number="sliderProgress"
              @input="$emit('progress-drag', $event)"
              @change="$emit('progress-change', $event)"
              @mousedown="$emit('press-slider')"
              @touchstart="$emit('press-slider')"
            />
          </div>

          <button class="icon-btn compact-btn" @click="$emit('next-chapter')">
            <span class="btn-emoji">&gt;</span>
            <span class="btn-text">下一章</span>
          </button>
        </div>

        <button class="icon-btn" @click="toggleNightMode">
          <span class="btn-icon">
            <svg v-if="readerSettings.isNight" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3.25" />
              <path
                d="M12 2.75v2M12 19.25v2M4.75 4.75l1.4 1.4M17.85 17.85l1.4 1.4M2.75 12h2M19.25 12h2M4.75 19.25l1.4-1.4M17.85 6.15l1.4-1.4"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24">
              <path d="M19.5 15.3A8.25 8.25 0 0 1 8.7 4.5 8.25 8.25 0 1 0 19.5 15.3Z" />
            </svg>
          </span>
          <span class="btn-text">{{ readerSettings.isNight ? '日间' : '夜间' }}</span>
        </button>

        <div style="position: relative">
          <button
            class="icon-btn"
            :class="{ 'active-btn': isSettingsPanelOpen }"
            @click.stop="toggleSettingsPanel"
          >
            <span class="btn-icon">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="2.75" />
                <path
                  d="M12 3.25v2M12 18.75v2M20.75 12h-2M5.25 12h-2M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4M18.2 18.2l-1.4-1.4M7.2 7.2 5.8 5.8"
                />
                <circle cx="12" cy="12" r="7" />
              </svg>
            </span>
            <span class="btn-text">设置</span>
          </button>

          <transition name="fade">
            <div
              v-if="isSettingsPanelOpen"
              class="advanced-settings-panel"
              @click.stop="isFontMenuOpen = false"
            >
              <div class="setting-row">
                <span class="row-label">模式</span>
                <div class="mode-switch-group">
                  <button
                    class="mode-btn"
                    :class="{ active: readingMode === 'scroll' }"
                    @click="readingMode = 'scroll'"
                  >
                    滚动
                  </button>
                  <button
                    class="mode-btn"
                    :class="{ active: readingMode === 'page' }"
                    @click="readingMode = 'page'"
                  >
                    翻页
                  </button>
                </div>
              </div>

              <div class="setting-row boss-key-row">
                <span class="row-label">老板键</span>
                <div class="boss-key-control">
                  <button
                    ref="bossKeyButtonRef"
                    type="button"
                    class="boss-key-recorder"
                    :class="{ recording: isRecordingBossKey }"
                    @click.stop="startBossKeyRecording"
                    @keydown.stop.prevent="captureBossKey"
                    @blur="isRecordingBossKey = false"
                  >
                    {{ isRecordingBossKey ? '请按下新快捷键…' : displayBossKey }}
                  </button>
                  <button
                    type="button"
                    class="boss-key-reset"
                    :disabled="bossKey === defaultBossKey"
                    @click.stop="restoreDefaultBossKey"
                  >
                    恢复
                  </button>
                  <span v-if="bossKeyMessage" class="boss-key-message">{{ bossKeyMessage }}</span>
                </div>
              </div>

              <div class="setting-row">
                <span class="row-label">亮度</span>
                <div class="slider-wrapper">
                  <span class="slider-icon">暗</span>
                  <div class="range-container">
                    <div
                      class="range-tooltip"
                      :style="{
                        left: `calc(${readerSettings.brightness}%)`
                      }"
                    >
                      {{ readerSettings.brightness }}%
                    </div>
                    <input
                      type="range"
                      class="apple-slider step-slider"
                      v-model.number="readerSettings.brightness"
                      min="0"
                      max="100"
                      step="5"
                      @input="markBrightnessCustomized"
                    />
                  </div>
                  <span class="slider-icon">亮</span>
                </div>
              </div>

              <div class="setting-row">
                <span class="row-label">字号</span>
                <div class="slider-wrapper">
                  <span class="slider-icon">小</span>
                  <div class="range-container">
                    <div
                      class="range-tooltip"
                      :style="{
                        left: `calc(${((readerSettings.fontSize - 12) / (36 - 12)) * 100}%)`
                      }"
                    >
                      {{ readerSettings.fontSize }}
                    </div>
                    <input
                      type="range"
                      class="apple-slider step-slider"
                      v-model.number="readerSettings.fontSize"
                      min="12"
                      max="36"
                      step="2"
                    />
                  </div>
                  <span class="slider-icon">大</span>
                </div>
              </div>

              <div class="setting-row">
                <span class="row-label">间距</span>
                <div class="slider-wrapper">
                  <span class="slider-icon">窄</span>
                  <div class="range-container">
                    <div
                      class="range-tooltip"
                      :style="{
                        left: `calc(${((readerSettings.lineHeight - 1.2) / (2.4 - 1.2)) * 100}%)`
                      }"
                    >
                      {{ readerSettings.lineHeight.toFixed(1) }}
                    </div>
                    <input
                      type="range"
                      class="apple-slider step-slider"
                      v-model.number="readerSettings.lineHeight"
                      min="1.2"
                      max="2.4"
                      step="0.2"
                    />
                  </div>
                  <span class="slider-icon">宽</span>
                </div>
              </div>

              <div class="setting-row" style="z-index: 100">
                <span class="row-label">字体</span>
                <div style="position: relative; flex: 1">
                  <div class="apple-custom-select" @click.stop="toggleFontMenu">
                    <span class="select-value">{{
                      fontOptions.find((opt) => opt.value === readerSettings.fontFamily)?.label ||
                      '跟随系统默认'
                    }}</span>
                    <span class="select-arrow"></span>
                  </div>
                  <transition name="fade">
                    <div v-if="isFontMenuOpen" class="apple-select-dropdown">
                      <div
                        v-for="opt in displayFontOptions"
                        :key="opt.value"
                        class="select-option"
                        :class="{ 'active-option': readerSettings.fontFamily === opt.value }"
                        @click="selectFont(opt.value)"
                      >
                        {{ opt.label }}
                      </div>
                    </div>
                  </transition>
                </div>
              </div>

              <div class="setting-row">
                <span class="row-label">背景</span>
                <div class="theme-palette">
                  <div
                    v-tooltip="'白色牛皮纸'"
                    class="theme-dot"
                    :class="{ 'active-theme': isCurrentTheme('#ffffff') }"
                    style="background: #ffffff; border: 1px solid #ddd"
                    @click="setPresetTheme('#ffffff', '#1d1d1f')"
                  ></div>
                  <div
                    v-tooltip="'羊皮纸'"
                    class="theme-dot"
                    :class="{ 'active-theme': isCurrentTheme('#f4f4e4') }"
                    style="background: #f4f4e4"
                    @click="setPresetTheme('#f4f4e4', '#4e342e')"
                  ></div>
                  <div
                    v-tooltip="'护眼绿'"
                    class="theme-dot"
                    :class="{ 'active-theme': isCurrentTheme('#cce8cf') }"
                    style="background: #cce8cf"
                    @click="setPresetTheme('#cce8cf', '#1b5e20')"
                  ></div>
                  <div
                    v-tooltip="'牛皮纸'"
                    class="theme-dot"
                    :class="{ 'active-theme': isCurrentTheme('#d7ccc8') }"
                    style="background: #d7ccc8"
                    @click="setPresetTheme('#d7ccc8', '#3e2723')"
                  ></div>
                  <div
                    v-tooltip="'暖阳橙'"
                    class="theme-dot"
                    :class="{ 'active-theme': isCurrentTheme('#ffe0b2') }"
                    style="background: #ffe0b2"
                    @click="setPresetTheme('#ffe0b2', '#e65100')"
                  ></div>

                  <label
                    v-tooltip="'调色盘'"
                    class="theme-dot custom-color"
                    :class="{
                      'active-theme':
                        !isCurrentTheme('#ffffff') &&
                        !isCurrentTheme('#f4f4e4') &&
                        !isCurrentTheme('#cce8cf') &&
                        !isCurrentTheme('#d7ccc8') &&
                        !isCurrentTheme('#ffe0b2') &&
                        !readerSettings.isNight &&
                        !readerSettings.bgImage
                    }"
                  >
                    <input
                      type="color"
                      v-model="readerSettings.bgColor"
                      @input="useCustomBackgroundColor"
                    />
                  </label>
                  <label
                    v-tooltip="'上传背景图片'"
                    class="theme-dot custom-image"
                    :class="{ 'active-theme': readerSettings.bgImage }"
                  >
                    <span>+</span>
                    <input type="file" accept="image/*" @change="handleBgImageUpload" />
                  </label>
                </div>
              </div>
            </div>
          </transition>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useReader } from '../../composables/useReader'
import { useSettings } from '../../composables/useSettings'
import { useKeyboardShortcuts } from '../../composables/useKeyboardShortcuts'
import { fontOptions } from '../../utils/constants'

// 拿到阅读模式
const { readingMode } = useReader()

// 向上抛出那些需要操作引擎的事件
defineEmits<{
  (e: 'close-menus'): void
  (e: 'prev-chapter'): void
  (e: 'next-chapter'): void
  (e: 'progress-drag', event: Event): void
  (e: 'progress-change', event: Event): void
  (e: 'press-slider'): void
}>()

// 引入全息单例状态
const { isToolbarVisible, isSidebarOpen, isSettingsPanelOpen, sliderProgress } = useReader()
const {
  readerSettings,
  isFontMenuOpen,
  displayFontOptions,
  toggleFontMenu,
  setPresetTheme,
  handleBgImageUpload,
  markBrightnessCustomized,
  isCurrentTheme
} = useSettings()
const { bossKey, defaultBossKey, setBossKey, resetBossKey } = useKeyboardShortcuts()
const bossKeyButtonRef = ref<HTMLButtonElement | null>(null)
const isRecordingBossKey = ref(false)
const bossKeyMessage = ref('')

const displayBossKey = computed(() =>
  bossKey.value
    .replaceAll('CommandOrControl', 'Ctrl/Cmd')
    .replaceAll('Control', 'Ctrl')
    .replaceAll('Command', 'Cmd')
)

const startBossKeyRecording = async (): Promise<void> => {
  bossKeyMessage.value = '功能键可单独使用；字母或数字需要配合 Ctrl、Alt 或 Cmd'
  isRecordingBossKey.value = true
  await nextTick()
  bossKeyButtonRef.value?.focus()
}

const captureBossKey = async (event: KeyboardEvent): Promise<void> => {
  if (!isRecordingBossKey.value) return
  if (event.key === 'Escape') {
    isRecordingBossKey.value = false
    bossKeyMessage.value = ''
    bossKeyButtonRef.value?.blur()
    return
  }

  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return

  const isFunctionKey = /^F(?:[1-9]|1\d|2[0-4])$/.test(event.key)
  const isLetterOrDigit = /^[a-z0-9]$/i.test(event.key)
  if (!isFunctionKey && !isLetterOrDigit) {
    bossKeyMessage.value = '请选择 F1–F24，或带 Ctrl/Alt/Cmd 的字母、数字'
    return
  }

  if (isLetterOrDigit && !event.ctrlKey && !event.altKey && !event.metaKey) {
    bossKeyMessage.value = '为避免影响正常输入，字母或数字必须配合 Ctrl、Alt 或 Cmd'
    return
  }

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Command')
  parts.push(isFunctionKey ? event.key : event.key.toUpperCase())

  const accelerator = parts.join('+')
  const result = await setBossKey(accelerator)
  if (!result.success) {
    bossKeyMessage.value = result.error || '设置失败，请换一个快捷键'
    return
  }

  isRecordingBossKey.value = false
  bossKeyMessage.value = '已生效'
  bossKeyButtonRef.value?.blur()
}

const restoreDefaultBossKey = async (): Promise<void> => {
  const result = await resetBossKey()
  bossKeyMessage.value = result.success ? '已恢复 F12' : result.error || '恢复失败'
  isRecordingBossKey.value = false
}

const toggleNightMode = (): void => {
  readerSettings.value.isNight = !readerSettings.value.isNight
  isSettingsPanelOpen.value = false
}

const toggleSettingsPanel = (): void => {
  isSettingsPanelOpen.value = !isSettingsPanelOpen.value
  isFontMenuOpen.value = false
}

const selectFont = (fontFamily: string): void => {
  readerSettings.value.fontFamily = fontFamily
  isFontMenuOpen.value = false
}

const useCustomBackgroundColor = (): void => {
  readerSettings.value.bgImage = ''
  readerSettings.value.isNight = false
}
</script>

<style scoped>
/* 包含了工具栏和设置面板的所有专属样式 */
.reader-toolbar {
  position: absolute;
  left: 14px;
  right: 14px;
  height: 64px;
  background: var(--reader-toolbar-bg, rgba(238, 238, 240, 0.94));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  z-index: 40;
  display: flex;
  align-items: center;
  padding: 0 12px;
  line-height: 1;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.055);
  border-radius: 15px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.09);
}
.is-night-mode.reader-toolbar {
  background: rgba(28, 28, 30, 0.9);
  color: #8e8e93;
  border-color: rgba(255, 255, 255, 0.05);
}
.bottom-toolbar {
  bottom: 10px;
  display: flex;
  justify-content: flex-start;
}
.toolbar-inner {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #1d1d1f;
  cursor: pointer;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 8px;
  transition: background 0.2s;
}
.is-night-mode .icon-btn {
  color: #8e8e93;
}
.icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
.is-night-mode .icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.icon-btn.active-btn {
  background: rgba(0, 0, 0, 0.08);
}
.is-night-mode .icon-btn.active-btn {
  background: rgba(255, 255, 255, 0.15);
}

.btn-emoji,
.btn-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #1d1d1f;
}
.btn-icon svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.is-night-mode .btn-emoji,
.is-night-mode .btn-icon {
  color: #8e8e93;
}
.btn-text {
  font-size: 11px;
  font-weight: 500;
  color: #7e7e81;
  line-height: 1;
  margin: 0;
  padding: 0;
}
.is-night-mode .btn-text {
  color: #666;
}

.progress-control-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
}
.progress-slider-wrapper {
  background: transparent !important;
  padding: 0 !important;
  max-width: 400px;
  width: 100%;
  transform: translateY(-7px);
}
.compact-btn {
  padding: 2px 6px;
  gap: 2px !important;
}
/* 修复 < 和 > 符号自带的行高留白问题 */
.compact-btn .btn-emoji {
  font-size: 18px;
  line-height: 1;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.advanced-settings-panel {
  position: absolute;
  bottom: 100%;
  right: -10px;
  margin-bottom: 16px;
  width: 360px;
  background: rgba(250, 250, 250, 0.98);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
}
.is-night-mode .advanced-settings-panel {
  background: rgba(35, 35, 38, 0.98);
  border-color: rgba(255, 255, 255, 0.08);
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.row-label {
  font-size: 14px;
  font-weight: 500;
  color: #666;
  width: 36px;
  flex-shrink: 0;
}
.is-night-mode .row-label {
  color: #aaa;
}

.boss-key-control {
  position: relative;
  flex: 1;
  display: flex;
  gap: 8px;
  padding-bottom: 17px;
}
.boss-key-recorder,
.boss-key-reset {
  height: 34px;
  border: 0;
  border-radius: 10px;
  font: inherit;
  cursor: pointer;
}
.boss-key-recorder {
  flex: 1;
  padding: 0 12px;
  background: rgba(0, 0, 0, 0.05);
  color: #333;
  text-align: left;
  outline: none;
}
.boss-key-recorder.recording {
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.42);
  color: #007aff;
}
.boss-key-reset {
  padding: 0 11px;
  background: rgba(0, 122, 255, 0.1);
  color: #007aff;
}
.boss-key-reset:disabled {
  cursor: default;
  opacity: 0.42;
}
.boss-key-message {
  position: absolute;
  left: 4px;
  right: 0;
  bottom: 0;
  overflow: hidden;
  color: #8e8e93;
  font-size: 10px;
  line-height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.is-night-mode .boss-key-recorder {
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
}

/* 🌟 带阻尼感的高级滑块 */
.slider-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.04);
  padding: 8px 12px;
  border-radius: 12px;
}
.is-night-mode .slider-wrapper {
  background: rgba(255, 255, 255, 0.06);
}
.slider-icon {
  font-size: 13px;
  color: #888;
  font-weight: bold;
}

.range-container {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}
/* 悬浮的动态数值提示球 */
.range-tooltip {
  position: absolute;
  top: -30px;
  transform: translateX(-50%);
  background: #1d1d1f;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 8px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}
.is-night-mode .range-tooltip {
  background: #fff;
  color: #000;
}
/* 只有按住/悬停滑块时才显示数值球 */
.range-container:active .range-tooltip,
.range-container:hover .range-tooltip {
  opacity: 1;
}

.apple-slider {
  -webkit-appearance: none;
  width: 100%;
  height: 4px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.is-night-mode .apple-slider {
  background: rgba(255, 255, 255, 0.2);
}
.apple-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 0.1s;
}
.apple-slider::-webkit-slider-thumb:active {
  transform: scale(1.15);
}

/* ==========================================
   设置：自定义字体选择下拉框
   ========================================== */
.apple-custom-select {
  flex: 1;
  background: rgba(0, 0, 0, 0.04);
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.2s;
}
.is-night-mode .apple-custom-select {
  background: rgba(255, 255, 255, 0.08);
  color: #ccc;
}
.apple-custom-select:hover {
  background: rgba(0, 0, 0, 0.08);
}
.select-arrow {
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 5px solid #888;
}

/* ==========================================
   🌟 字体下拉框滚动与护盾 (终极对齐版)
   ========================================== */
.apple-select-dropdown {
  position: absolute;
  top: 100%;
  bottom: auto;
  left: 0;
  right: 0;
  margin-top: 8px;
  margin-bottom: 0;
  max-height: 108px;
  overflow-y: auto;
  background: rgba(250, 250, 250, 0.95);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.05);
  z-index: 100;
}
.is-night-mode .apple-select-dropdown {
  background: rgba(30, 30, 32, 0.95);
  border-color: rgba(255, 255, 255, 0.05);
}
.apple-select-dropdown::-webkit-scrollbar {
  width: 6px;
}
.apple-select-dropdown::-webkit-scrollbar-track {
  background: transparent;
  margin: 6px 0;
}
.apple-select-dropdown::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 10px;
}
.apple-select-dropdown::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
.is-night-mode .apple-select-dropdown::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

/* 把高度绝对锁死在 36px，并用 flex 保证文字永远垂直居中 */
.select-option {
  height: 36px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  transition: background 0.2s;
}
.is-night-mode .select-option {
  color: #ccc;
}
.select-option:hover {
  background: rgba(0, 0, 0, 0.05);
}
.is-night-mode .select-option:hover {
  background: rgba(255, 255, 255, 0.08);
}
.active-option {
  color: #007aff;
  background: rgba(0, 122, 255, 0.08);
  font-weight: 600;
}

/* 阅读页主题色彩轮盘 */
.theme-palette {
  display: flex;
  flex: 1;
  justify-content: space-between;
  align-items: center;
}
.theme-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  transition: transform 0.1s;
}
.theme-dot:active {
  transform: scale(0.85);
}
.custom-color {
  overflow: hidden;
  border: 2px solid #ddd;
  background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
}
.custom-color input {
  width: 40px;
  height: 40px;
  border: none;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}
.custom-image {
  border: 2px dashed #bbb;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-weight: bold;
}
.custom-image input {
  display: none;
}
.active-theme {
  outline: 2px solid #007aff;
  outline-offset: 3px;
}

.slide-bottom-enter-active,
.slide-bottom-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.25, 0.8, 0.2, 1),
    opacity 0.3s ease;
}
.slide-bottom-enter-from,
.slide-bottom-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 🌟 新增的模式切换器样式，即翻页模式 */
.mode-switch-group {
  display: flex;
  flex: 1;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px; /* 圆角稍微大点匹配苹果风 */
  padding: 3px;
  gap: 2px;
}
.is-night-mode .mode-switch-group {
  background: rgba(255, 255, 255, 0.08);
}

.mode-btn {
  flex: 1;
  border: none;
  background: transparent;
  padding: 6px 0;
  border-radius: 8px;
  font-size: 13px;
  cursor: pointer;
  color: #666;
  font-weight: 500;
  transition: all 0.2s ease-in-out;
}
.is-night-mode .mode-btn {
  color: #aaa;
}

/* 选中状态下的样式 */
.mode-btn.active {
  background: #ffffff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  color: #1d1d1f;
  font-weight: 600;
}
.is-night-mode .mode-btn.active {
  background: #333;
  color: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
</style>
