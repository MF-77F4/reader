<!-- src/renderer/src/components/reader/HighlightMenuPanel.vue -->
<!-- 双栏高亮面板组件，左侧显示章节列表，右侧显示对应章节的笔记卡片 -->
<template>
  <transition name="fade">
    <div v-if="isHighlightMenuOpen" class="hl-dual-panel" @click.stop>
      <button
        class="hl-sort-btn"
        v-tooltip="
          highlightChapterSortOrder === 'asc'
            ? '章节当前为正序，点击切换为倒序'
            : '章节当前为倒序，点击切换为正序'
        "
        @click="highlightChapterSortOrder = highlightChapterSortOrder === 'asc' ? 'desc' : 'asc'"
      >
        {{ highlightChapterSortOrder === 'asc' ? '↑ 章节' : '↓ 章节' }}
      </button>

      <!-- 左侧：章节列表 -->
      <div class="hl-panel-left">
        <div v-if="groupedHighlights.length === 0" class="hl-empty-text">暂无笔记</div>
        <div
          v-for="group in groupedHighlights"
          :key="group.title"
          class="hl-chapter-item"
          :class="{ active: activeHighlightChapter === group.title }"
          @click="activeHighlightChapter = group.title"
        >
          <div class="hl-ch-title">{{ group.title }}</div>
          <div class="hl-ch-count">{{ group.highlights.length }}</div>
        </div>
      </div>

      <!-- 右侧：对应章节的具体笔记卡片 -->
      <div class="hl-panel-right">
        <template v-for="group in groupedHighlights" :key="'content-' + group.title">
          <div v-show="activeHighlightChapter === group.title" class="hl-list-container">
            <div
              v-for="hl in group.highlights"
              :key="hl.id"
              class="hl-snippet-card"
              @click="$emit('jump', hl)"
            >
              <div class="hl-snippet-text" :class="{ 'is-annotate': hl.type === 'annotate' }">
                {{ hl.snippet || hl.text || '（未能恢复选中的原句）' }}
              </div>
              <div class="hl-snippet-time">{{ formatHlTime(hl.timestamp) }}</div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useAnnotation } from '../../composables/useAnnotation'
import { formatHlTime } from '../../utils/formatter'

// 接收从 App.vue 传递过来的计算好的分组数据
defineProps<{
  groupedHighlights: any[]
}>()

// 向上抛出点击某条笔记要求跳转的事件
defineEmits<{
  (e: 'jump', hl: any): void
}>()

// 引入全局单例状态，用于控制面板开关和左侧当前选中的章节
const { isHighlightMenuOpen, activeHighlightChapter, highlightChapterSortOrder } = useAnnotation()
</script>

<style scoped>
/* ==========================================
   双栏高亮面板专属样式
   ========================================== */
.hl-dual-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 10px;
  width: 460px;
  height: 340px;
  background: rgba(250, 250, 250, 0.95);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
  z-index: 100;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}
.is-night-mode .hl-dual-panel {
  background: rgba(30, 30, 32, 0.95);
  border-color: rgba(255, 255, 255, 0.08);
}

.hl-panel-left {
  width: 38%;
  background: rgba(0, 0, 0, 0.02);
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  overflow-y: auto;
  padding: 8px;
}
.is-night-mode .hl-panel-left {
  background: rgba(0, 0, 0, 0.15);
  border-color: rgba(255, 255, 255, 0.05);
}

.hl-empty-text {
  text-align: center;
  color: #999;
  font-size: 13px;
  margin-top: 40px;
}

.hl-chapter-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.2s;
}
.hl-chapter-item:hover {
  background: rgba(0, 0, 0, 0.04);
}
.is-night-mode .hl-chapter-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.hl-chapter-item.active {
  background: rgba(0, 122, 255, 0.1);
}
.is-night-mode .hl-chapter-item.active {
  background: rgba(10, 132, 255, 0.15);
}

.hl-ch-title {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100px;
}
.hl-chapter-item.active .hl-ch-title {
  color: #007aff;
  font-weight: 600;
}
.is-night-mode .hl-ch-title {
  color: #ccc;
}
.is-night-mode .hl-chapter-item.active .hl-ch-title {
  color: #0a84ff;
}

.hl-ch-count {
  font-size: 12px;
  color: #888;
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 10px;
}
.hl-chapter-item.active .hl-ch-count {
  background: rgba(0, 122, 255, 0.15);
  color: #007aff;
}
.is-night-mode .hl-ch-count {
  background: rgba(255, 255, 255, 0.1);
  color: #999;
}

.hl-panel-right {
  width: 62%;
  overflow-y: auto;
  padding: 42px 12px 12px;
}
.hl-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hl-sort-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  border: none;
  border-radius: 12px;
  padding: 4px 9px;
  background: rgba(0, 0, 0, 0.06);
  color: #666;
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;
}
.hl-sort-btn:hover {
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
}
.is-night-mode .hl-sort-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
}
.is-night-mode .hl-sort-btn:hover {
  background: rgba(10, 132, 255, 0.18);
  color: #0a84ff;
}

.hl-snippet-card {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.2s;
  background: transparent;
}
.hl-snippet-card:hover {
  background: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.05);
}
.is-night-mode .hl-snippet-card:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.05);
}

.hl-snippet-text {
  font-size: 14px;
  color: #1d1d1f;
  line-height: 1.4;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 6px;
  padding-left: 8px;
  border-left: 3px solid #ffcc00;
}
.is-night-mode .hl-snippet-text {
  color: #e5e5ea;
  border-left-color: #daa520;
}
.hl-snippet-text.is-annotate {
  border-left-color: #ff3b30;
}
.is-night-mode .hl-snippet-text.is-annotate {
  border-left-color: #ff453a;
}

.hl-snippet-time {
  font-size: 11px;
  color: #999;
  text-align: right;
  font-family: monospace;
}

.hl-panel-left::-webkit-scrollbar,
.hl-panel-right::-webkit-scrollbar {
  width: 4px;
}
.hl-panel-left::-webkit-scrollbar-track,
.hl-panel-right::-webkit-scrollbar-track {
  background: transparent;
}
.hl-panel-left::-webkit-scrollbar-thumb,
.hl-panel-right::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}
.hl-panel-left:hover::-webkit-scrollbar-thumb,
.hl-panel-right:hover::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.25);
}
.is-night-mode .hl-panel-left:hover::-webkit-scrollbar-thumb,
.is-night-mode .hl-panel-right:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
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
