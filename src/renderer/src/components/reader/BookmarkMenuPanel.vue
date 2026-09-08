<template>
  <transition name="fade">
    <div v-if="isBookmarkMenuOpen" class="bookmark-panel" @click.stop>
      <div class="bookmark-header">
        <span>书签</span>
        <div class="bookmark-header-actions">
          <button
            class="bookmark-sort-btn"
            v-tooltip="
              bookmarkSortOrder === 'asc'
                ? '当前为正序，点击切换为倒序'
                : '当前为倒序，点击切换为正序'
            "
            @click="bookmarkSortOrder = bookmarkSortOrder === 'asc' ? 'desc' : 'asc'"
          >
            {{ bookmarkSortOrder === 'asc' ? '↑' : '↓' }}
          </button>
          <button class="bookmark-add-btn" @click="addCurrentBookmark">+ 添加当前页</button>
        </div>
      </div>

      <div class="bookmark-list">
        <div v-if="sortedBookmarks.length === 0" class="bookmark-empty">暂无书签</div>
        <div
          v-for="bookmark in sortedBookmarks"
          :key="bookmark.id"
          class="bookmark-card"
          @click="$emit('jump', bookmark)"
        >
          <div class="bookmark-card-title">{{ bookmark.chapterTitle }}</div>
          <div class="bookmark-card-snippet">{{ bookmark.snippet }}</div>
          <div class="bookmark-card-footer">
            <span>{{ formatHlTime(bookmark.createdAt) }}</span>
            <button
              v-tooltip="'删除书签'"
              class="bookmark-delete-btn"
              @click.stop="deleteBookmark(bookmark.id)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useBookmark, type Bookmark } from '../../composables/useBookmark'
import { formatHlTime } from '../../utils/formatter'

defineEmits<{
  (e: 'jump', bookmark: Bookmark): void
}>()

const {
  isBookmarkMenuOpen,
  bookmarkSortOrder,
  sortedBookmarks,
  addCurrentBookmark,
  deleteBookmark
} = useBookmark()
</script>

<style scoped>
.bookmark-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 10px;
  width: 340px;
  max-height: 380px;
  overflow: hidden;
  background: rgba(250, 250, 250, 0.96);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 14px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
  z-index: 100;
  display: flex;
  flex-direction: column;
}
.is-night-mode .bookmark-panel {
  background: rgba(30, 30, 32, 0.96);
  border-color: rgba(255, 255, 255, 0.08);
}
.bookmark-header {
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 15px;
  font-weight: 600;
}
.is-night-mode .bookmark-header {
  border-color: rgba(255, 255, 255, 0.06);
  color: #ddd;
}
.bookmark-header-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}
.bookmark-sort-btn,
.bookmark-add-btn,
.bookmark-delete-btn {
  border: none;
  cursor: pointer;
  border-radius: 10px;
}
.bookmark-sort-btn {
  width: 26px;
  height: 26px;
  background: rgba(0, 0, 0, 0.06);
  color: #666;
}
.bookmark-add-btn {
  padding: 6px 9px;
  background: rgba(0, 122, 255, 0.12);
  color: #007aff;
  font-size: 12px;
}
.bookmark-list {
  overflow-y: auto;
  padding: 8px;
}
.bookmark-empty {
  padding: 36px 0;
  text-align: center;
  color: #999;
  font-size: 13px;
}
.bookmark-card {
  width: 100%;
  box-sizing: border-box;
  text-align: left;
  padding: 10px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
  color: inherit;
}
.bookmark-card:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.04);
}
.is-night-mode .bookmark-card:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.05);
}
.bookmark-card-title {
  color: #1d1d1f;
  font-size: 13px;
  font-weight: 600;
}
.is-night-mode .bookmark-card-title {
  color: #eee;
}
.bookmark-card-snippet {
  margin-top: 5px;
  color: #777;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bookmark-card-footer {
  margin-top: 7px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #999;
  font-size: 11px;
  font-family: monospace;
}
.bookmark-delete-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  color: #ff3b30;
  font-size: 18px;
  line-height: 18px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
