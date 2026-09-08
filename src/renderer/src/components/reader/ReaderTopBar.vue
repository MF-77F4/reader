<!-- src/renderer/src/components/reader/ReaderTopBar.vue -->
<!-- 
  这个组件负责显示阅读器顶部的工具栏和一些基本信息（书名、时间等）。它会根据父组件传入的状态来控制显示和隐藏，以及提供一些交互功能（返回书架、打开菜单等）。
-->

<template>
  <div class="reader-safe-header">
    <span class="subtle-book-title">{{ cleanBookTitle(currentBookTitle) }}</span>
    <span class="reader-time">{{ currentTime }}</span>
  </div>

  <transition name="slide-top">
    <!-- 同样注入了夜间模式 -->
    <div
      v-if="isToolbarVisible"
      class="reader-toolbar top-toolbar"
      :class="{ 'is-night-mode': readerSettings.isNight }"
      @click.stop="$emit('close-menus')"
      @mousedown.stop
      @mouseup.stop
    >
      <div class="toolbar-inner">
        <button class="icon-btn" @click="$emit('go-shelf')">
          <span class="btn-emoji">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
          <span class="btn-text">返回</span>
        </button>

        <div class="toolbar-center-text">
          <span v-if="isParsing">✨ 正在扫描全书...</span>
          <span v-else-if="isLoading">加载中...</span>
        </div>

        <div style="position: relative">
          <!-- 注意：这里的点击事件我保留了 .stop 防止冒泡收起自己 -->
          <button class="icon-btn" @click.stop="toggleTopMenu">
            <span class="btn-emoji">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="5" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="12" cy="19" r="1" />
              </svg>
            </span>
          </button>

          <transition name="fade">
            <div v-if="isTopMenuOpen" class="top-dropdown" @click.stop>
              <button class="icon-btn menu-action-btn" @click="openBookmarkMenu">
                <span class="btn-icon">
                  <svg viewBox="0 0 24 24">
                    <path
                      d="M6.75 4.75A2.25 2.25 0 0 1 9 2.5h6a2.25 2.25 0 0 1 2.25 2.25v16l-5.25-3-5.25 3z"
                    />
                  </svg>
                </span>
                <span class="btn-text">书签</span>
              </button>
              <button class="icon-btn menu-action-btn" @click="openHighlightMenu">
                <span class="btn-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="m14.25 4.25 5.5 5.5" />
                    <path
                      d="m5.25 13.25 8.9-8.9a1.75 1.75 0 0 1 2.47 0l3.03 3.03a1.75 1.75 0 0 1 0 2.47l-8.9 8.9-6.5 1z"
                    />
                    <path d="m5.25 13.25 5.5 5.5" />
                    <path d="M3.5 21h17" />
                  </svg>
                </span>
                <span class="btn-text">标记</span>
              </button>
              <button class="icon-btn menu-action-btn danger-btn" @click="$emit('delete-book')">
                <span class="btn-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M4.5 6.5h15" />
                    <path
                      d="M9 6.5V4.75A1.25 1.25 0 0 1 10.25 3.5h3.5A1.25 1.25 0 0 1 15 4.75V6.5"
                    />
                    <path d="m6.75 6.5.75 13h9l.75-13" />
                    <path d="M10 10v6M14 10v6" />
                  </svg>
                </span>
                <span class="btn-text">删除</span>
              </button>
            </div>
          </transition>

          <HighlightMenuPanel
            :grouped-highlights="groupedHighlights"
            @jump="$emit('jump-to-highlight', $event)"
          />
          <BookmarkMenuPanel @jump="$emit('jump-to-bookmark', $event)" />
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useReader } from '../../composables/useReader'
import { useAnnotation } from '../../composables/useAnnotation'
import { useSettings } from '../../composables/useSettings'
import { cleanBookTitle } from '../../utils/formatter'
import HighlightMenuPanel from './HighlightMenuPanel.vue'
import BookmarkMenuPanel from './BookmarkMenuPanel.vue'
import { useBookmark, type Bookmark } from '../../composables/useBookmark'

defineEmits<{
  (e: 'go-shelf'): void
  (e: 'delete-book'): void
  (e: 'close-menus'): void
  (e: 'jump-to-highlight', hl: any): void
  (e: 'jump-to-bookmark', bookmark: Bookmark): void
}>()

defineProps<{
  groupedHighlights: any[] // 👈 必须要有这个定义，否则父组件传不进去
}>()

const { isToolbarVisible, isParsing, isLoading, currentBookTitle, currentTime } = useReader()
const { isTopMenuOpen, isHighlightMenuOpen } = useAnnotation()
const { isBookmarkMenuOpen } = useBookmark()
const { readerSettings } = useSettings()

const toggleTopMenu = (): void => {
  isTopMenuOpen.value = !isTopMenuOpen.value
  isHighlightMenuOpen.value = false
  isBookmarkMenuOpen.value = false
}

const openBookmarkMenu = (): void => {
  isTopMenuOpen.value = false
  isHighlightMenuOpen.value = false
  isBookmarkMenuOpen.value = true
}

const openHighlightMenu = (): void => {
  isTopMenuOpen.value = false
  isBookmarkMenuOpen.value = false
  isHighlightMenuOpen.value = true
}
</script>

<style scoped>
/* 顶部常驻信息 */
.reader-safe-header {
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  background: transparent;
  z-index: 10;
}
.subtle-book-title {
  font-size: 13px;
  font-weight: 500;
  color: #c7c7cc;
  letter-spacing: 0.05em;
  user-select: none;
  pointer-events: none;
}
.reader-time {
  font-size: 13px;
  font-weight: 500;
  color: #7e7e81;
  user-select: none;
  pointer-events: none;
  letter-spacing: 0.05em;
  margin-right: 40px;
}
.is-night-mode .reader-time {
  color: #8e8e93;
}

/* 顶部工具栏 */
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
.top-toolbar {
  top: 10px;
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
.toolbar-center-text {
  flex: 1;
  text-align: center;
  font-size: 14px;
  color: #86868b;
}

/* 下拉菜单 */
.top-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 10px;
  background: rgba(250, 250, 250, 0.95);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: row;
  padding: 8px;
  gap: 4px;
  z-index: 100;
}
.is-night-mode .top-dropdown {
  background: rgba(30, 30, 32, 0.95);
  border-color: rgba(255, 255, 255, 0.05);
}

/* 按钮基础样式 */
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
.icon-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
.is-night-mode .icon-btn {
  color: #8e8e93;
}
.is-night-mode .icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.menu-action-btn {
  min-width: 48px;
}
.menu-action-btn .btn-text {
  white-space: nowrap;
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
.danger-btn .btn-icon,
.danger-btn .btn-text {
  color: #ff3b30 !important;
}
.is-night-mode .danger-btn .btn-icon,
.is-night-mode .danger-btn .btn-text {
  color: #ff453a !important;
}

/* 动画 */
.slide-top-enter-active,
.slide-top-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.25, 0.8, 0.2, 1),
    opacity 0.3s ease;
}
.slide-top-enter-from,
.slide-top-leave-to {
  transform: translateY(-100%);
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
</style>
