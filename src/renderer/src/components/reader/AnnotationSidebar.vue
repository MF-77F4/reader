<template>
  <transition name="slide-panel">
    <!-- 🌟 动态绑定夜间模式，让子组件识别当前主题 -->
    <div
      v-show="isAnnotationPanelOpen"
      class="annotation-sidebar"
      :class="{ 'is-night-mode': readerSettings.isNight }"
      @click.stop
    >
      <div class="ann-sidebar-header">
        <span>批注详情</span>
        <!-- 恢复为无背景的纯净图标按钮 -->
        <button
          class="icon-btn"
          style="
            height: 30px;
            width: 30px;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
          "
          aria-label="关闭"
          @click="isAnnotationPanelOpen = false"
        >
          <svg viewBox="0 0 24 24">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      </div>
      <div class="ann-sidebar-content" v-if="currentViewingNote">
        <div class="ann-snippet">「 {{ currentViewingNote.snippet }} 」</div>
        <div class="ann-time">{{ currentViewingNote.time }}</div>
        <div class="ann-note-text">{{ currentViewingNote.note }}</div>
      </div>
      <div class="ann-sidebar-footer" style="display: flex; gap: 12px">
        <button class="apple-btn cancel" style="flex: 1" @click="$emit('edit')">
          <svg viewBox="0 0 24 24">
            <path d="m14.5 5.5 4 4" />
            <path
              d="m5 19 1.25-5.25 8.9-8.9a1.4 1.4 0 0 1 1.98 0l2.02 2.02a1.4 1.4 0 0 1 0 1.98l-8.9 8.9z"
            />
          </svg>
          <span>修改</span>
        </button>
        <button
          class="apple-btn cancel destructive-cancel"
          style="flex: 1"
          @click="$emit('delete')"
        >
          <svg viewBox="0 0 24 24">
            <path d="M4.5 6.5h15" />
            <path d="M9 6.5V4.75A1.25 1.25 0 0 1 10.25 3.5h3.5A1.25 1.25 0 0 1 15 4.75V6.5" />
            <path d="m6.75 6.5.75 13h9l.75-13" />
            <path d="M10 10v6M14 10v6" />
          </svg>
          <span>删除</span>
        </button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useAnnotation } from '../../composables/useAnnotation'
import { useSettings } from '../../composables/useSettings'

defineEmits<{ (e: 'edit'): void; (e: 'delete'): void }>()

const { isAnnotationPanelOpen, currentViewingNote } = useAnnotation()
const { readerSettings } = useSettings() // 引入设置以判断是否为夜间模式
</script>

<style scoped>
/* 容器与排版样式 */
.annotation-sidebar {
  position: absolute;
  top: 12px;
  bottom: 12px;
  right: 12px;
  width: 320px;
  overflow: hidden;
  z-index: 95;
  display: flex;
  flex-direction: column;
  background: rgba(250, 250, 250, 0.98);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border: 1px solid rgba(0, 0, 0, 0.055);
  border-radius: 16px;
  box-shadow: -8px 8px 30px rgba(0, 0, 0, 0.1);
}
.is-night-mode.annotation-sidebar {
  background: rgba(35, 35, 38, 0.98);
  border-color: rgba(255, 255, 255, 0.05);
}

.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 0.25s cubic-bezier(0.25, 0.8, 0.2, 1);
}
.slide-panel-enter-from,
.slide-panel-leave-to {
  transform: translateX(100%);
}

.ann-sidebar-header {
  padding: 20px 24px 12px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  font-weight: 600;
}
.is-night-mode .ann-sidebar-header {
  border-color: rgba(255, 255, 255, 0.05);
  color: #ccc;
}

.ann-sidebar-content {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ann-snippet {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
  border-left: 3px solid #ff3b30;
  padding-left: 10px;
}
.is-night-mode .ann-snippet {
  color: #aaa;
}
.ann-time {
  font-size: 12px;
  color: #999;
  font-family: monospace;
  text-align: right;
}
.ann-note-text {
  font-size: 16px;
  color: #1d1d1f;
  line-height: 1.8;
  white-space: pre-wrap;
}
.is-night-mode .ann-note-text {
  color: #eee;
}

.ann-sidebar-footer {
  padding: 20px 24px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}
.is-night-mode .ann-sidebar-footer {
  border-color: rgba(255, 255, 255, 0.05);
}

/* 👇 补回丢失的按钮原生样式，彻底干掉浏览器默认的丑陋灰框 👇 */
.icon-btn {
  background: transparent;
  border: none;
  color: #1d1d1f;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.2s;
}
.icon-btn svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
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

.apple-btn {
  border: none;
  font-size: 15px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  padding: 10px 0;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.apple-btn svg {
  width: 17px;
  height: 17px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.apple-btn:active {
  transform: scale(0.95);
}
.apple-btn.cancel {
  background: #f2f2f7;
  color: #1d1d1f;
}
.apple-btn.cancel:hover {
  background: #e5e5ea;
}

/* 🌟 补上夜间模式下的 Apple 按钮高级感适配 */
.is-night-mode .apple-btn.cancel {
  background: rgba(255, 255, 255, 0.08);
  color: #e5e5ea;
}
.is-night-mode .apple-btn.cancel:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
