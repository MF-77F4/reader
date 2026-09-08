<!-- src/renderer/src/components/reader/TocSidebar.vue -->
<!-- 
  这个组件负责显示阅读器的目录侧边栏。它会根据父组件传入的状态来控制显示和隐藏，并展示当前书籍的章节列表。用户可以点击章节跳转到对应位置。-->
<template>
  <transition name="fade">
    <div v-if="isSidebarOpen" class="toc-mask" @click="isSidebarOpen = false"></div>
  </transition>
  <transition name="slide-left">
    <!-- 同样注入了夜间模式 -->
    <div
      v-show="isSidebarOpen"
      class="toc-sidebar"
      :class="{ 'is-night-mode': readerSettings.isNight }"
    >
      <div class="toc-header">
        <span>目录 ({{ tocList.length }}项)</span>
        <div class="toc-header-actions">
          <button
            v-if="tocList.length > 0 && !isDeleteMode"
            class="delete-current-toc-btn"
            type="button"
            @click="enterDeleteMode"
          >
            选择删除
          </button>
          <template v-else>
            <button class="toc-cancel-delete-btn" type="button" @click="exitDeleteMode">
              取消
            </button>
            <button
              class="delete-current-toc-btn"
              type="button"
              :disabled="selectedTocKeys.size === 0"
              @click="deleteSelectedItems"
            >
              删除 {{ selectedTocKeys.size || '' }}
            </button>
          </template>
        </div>
      </div>
      <div v-if="tocList.length > 0" class="toc-list">
        <div
          v-for="(item, index) in visibleTocList"
          :key="getTocItemKey(item, index)"
          class="toc-item"
          :class="{
            'active-chapter': activeChapterTitle === item.title,
            'toc-item-child': (item.depth || 0) > 0,
            'is-delete-mode': isDeleteMode,
            'is-selected': selectedTocKeys.has(getTocItemKey(item, index))
          }"
          :style="{ paddingLeft: `${20 + (item.depth || 0) * 16}px` }"
          @click="onTocItemClick(item, index)"
        >
          <span
            v-if="isDeleteMode"
            class="toc-select-box"
            :class="{ checked: selectedTocKeys.has(getTocItemKey(item, index)) }"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m3.5 8.2 3 3 6-6.4" />
            </svg>
          </span>
          <button
            v-if="item.hasChildren"
            class="toc-expand-button"
            :class="{ expanded: expandedTocIds.has(item.id || '') }"
            type="button"
            aria-label="展开或收起子目录"
            @click.stop="toggleTocItem(item)"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" />
            </svg>
          </button>
          <span v-else class="toc-expand-placeholder"></span>
          <span class="toc-item-title">{{ item.title }}</span>
        </div>
      </div>
      <div v-else class="toc-empty-state">
        <span>{{ isParsing ? '正在识别章节…' : '暂未识别到章节' }}</span>
        <small v-if="!isParsing">你仍然可以在正文中选中文字并设为标题。</small>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useReader, type TOCItem } from '../../composables/useReader'
import { useSettings } from '../../composables/useSettings'

const emit = defineEmits<{
  (e: 'jump', item: TOCItem): void
  (e: 'delete-items', items: TOCItem[]): void
}>()

const { isSidebarOpen, isParsing, tocList, activeChapterTitle } = useReader()
const { readerSettings } = useSettings()
const expandedTocIds = ref(new Set<string>())
const isDeleteMode = ref(false)
const selectedTocKeys = ref(new Set<string>())

const visibleTocList = computed(() =>
  tocList.value.filter((item) =>
    (item.parentIds || []).every((parentId) => expandedTocIds.value.has(parentId))
  )
)

const toggleTocItem = (item: TOCItem) => {
  if (!item.id) return

  const nextExpandedIds = new Set(expandedTocIds.value)
  if (nextExpandedIds.has(item.id)) {
    nextExpandedIds.delete(item.id)
  } else {
    nextExpandedIds.add(item.id)
  }
  expandedTocIds.value = nextExpandedIds
}

const getTocItemKey = (item: TOCItem, index: number): string =>
  item.manualId ||
  item.id ||
  item.cfi ||
  item.href ||
  (item.titleStart !== undefined ? `txt:${item.titleStart}:${item.title}` : '') ||
  (item.pageNumber !== undefined ? `pdf:${item.pageNumber}:${item.title}` : '') ||
  `${item.title}:${index}`

const enterDeleteMode = (): void => {
  isDeleteMode.value = true
  selectedTocKeys.value = new Set()
}

const exitDeleteMode = (): void => {
  isDeleteMode.value = false
  selectedTocKeys.value = new Set()
}

const toggleSelectedItem = (item: TOCItem, index: number): void => {
  const itemKey = getTocItemKey(item, index)
  const nextSelectedKeys = new Set(selectedTocKeys.value)
  if (nextSelectedKeys.has(itemKey)) nextSelectedKeys.delete(itemKey)
  else nextSelectedKeys.add(itemKey)
  selectedTocKeys.value = nextSelectedKeys
}

const onTocItemClick = (item: TOCItem, index: number): void => {
  if (isDeleteMode.value) {
    toggleSelectedItem(item, index)
    return
  }
  emit('jump', item)
}

const deleteSelectedItems = (): void => {
  const selectedItems = visibleTocList.value.filter((item, index) =>
    selectedTocKeys.value.has(getTocItemKey(item, index))
  )
  emit('delete-items', selectedItems)
  exitDeleteMode()
}
</script>

<style scoped>
/* 遮罩与整体抽屉 */
.toc-mask {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.14);
  z-index: 90;
  backdrop-filter: blur(2px);
}
.toc-sidebar {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 12px;
  width: 300px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.055);
  border-radius: 16px;
  box-shadow: 4px 8px 30px rgba(0, 0, 0, 0.1);
  z-index: 100;
  display: flex;
  flex-direction: column;
}
.is-night-mode.toc-sidebar {
  background: rgba(35, 35, 38, 0.98);
  border-color: rgba(255, 255, 255, 0.05);
}

/* 头部与列表项 */
.toc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 12px;
  font-weight: 600;
  font-size: 18px;
  color: #1d1d1f;
  border-bottom: 1px solid rgba(0, 0, 0, 0.03);
}
.toc-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.delete-current-toc-btn,
.toc-cancel-delete-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  padding: 4px 0;
}
.delete-current-toc-btn {
  color: #ff3b30;
}
.delete-current-toc-btn:hover {
  color: #d70015;
}
.delete-current-toc-btn:disabled {
  cursor: default;
  opacity: 0.35;
}
.toc-cancel-delete-btn {
  color: #77777d;
}
.toc-cancel-delete-btn:hover {
  color: #333;
}
.is-night-mode .toc-header {
  color: #ccc;
  border-color: rgba(255, 255, 255, 0.05);
}
.toc-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
}
.toc-empty-state {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: #77777d;
  text-align: center;
}
.toc-empty-state small {
  color: #9a9aa0;
  line-height: 1.5;
}
.toc-item {
  position: relative;
  display: flex;
  align-items: center;
  padding: 12px 16px 12px 20px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
  border-radius: 8px;
  white-space: nowrap;
  overflow: hidden;
  margin-bottom: 2px;
  transition: all 0.2s;
}
.toc-item-child {
  font-size: 13px;
  color: #666;
}
.toc-expand-button,
.toc-expand-placeholder {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  margin-right: 4px;
}
.toc-expand-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  transition: transform 0.2s;
}
.toc-expand-button.expanded {
  transform: rotate(90deg);
}
.toc-expand-button svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
}
.toc-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.toc-item.is-delete-mode {
  gap: 7px;
}
.toc-item.is-selected {
  background: rgba(255, 59, 48, 0.08);
}
.toc-select-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 5px;
  color: #fff;
  background: rgba(255, 255, 255, 0.78);
}
.toc-select-box svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
}
.toc-select-box.checked {
  border-color: #ff3b30;
  background: #ff3b30;
}
.toc-select-box.checked svg {
  opacity: 1;
}
.is-night-mode .toc-item {
  color: #aaa;
}
.is-night-mode .toc-select-box {
  border-color: rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.08);
}
.is-night-mode .toc-select-box.checked {
  border-color: #ff453a;
  background: #ff453a;
}
.toc-item:hover {
  background: rgba(0, 0, 0, 0.04);
}
.is-night-mode .toc-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* 激活状态特效 */
.toc-item.active-chapter {
  background-color: rgba(0, 122, 255, 0.08);
  color: #007aff;
  font-weight: 600;
}
.is-night-mode .toc-item.active-chapter {
  background: rgba(255, 255, 255, 0.1);
  color: #0a84ff;
}
.toc-item.active-chapter::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 16px;
  border-radius: 4px;
  background: linear-gradient(180deg, #32ade6, #007aff);
  box-shadow: 0 2px 6px rgba(0, 122, 255, 0.3);
}
.is-night-mode .toc-item.active-chapter::before {
  background: linear-gradient(180deg, #0a84ff, #0040dd);
}

/* 自定义高级滚动条 */
.toc-list::-webkit-scrollbar {
  width: 6px;
}
.toc-list::-webkit-scrollbar-track {
  background: transparent;
}
.toc-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 10px;
}
.toc-sidebar:hover .toc-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.3);
}
.is-night-mode .toc-sidebar:hover .toc-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

/* 动画 */
.slide-left-enter-active,
.slide-left-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.25, 0.8, 0.2, 1),
    opacity 0.3s ease;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
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
