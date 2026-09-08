<template>
  <div class="app-container">
    <header class="app-window-bar" data-tauri-drag-region>
      <div class="app-drag-region" data-tauri-drag-region></div>
      <WindowControls />
    </header>

    <ShelfView v-if="currentView === 'shelf'" @scan-books="handleScanBooks" @open-book="openBook" />

    <div
      v-else-if="currentView === 'reader'"
      class="reader-view"
      :class="{ 'is-night-mode': readerSettings.isNight }"
      :style="readerStyle"
    >
      <!-- 修改 App.vue 里的顶栏，把高亮数据作为“快递”打包传给它 -->
      <ReaderTopBar
        :grouped-highlights="groupedHighlights"
        @close-menus="closeAllSecondaryMenus"
        @go-shelf="goShelf"
        @delete-book="deleteCurrentBook"
        @jump-to-highlight="jumpToHighlight"
        @jump-to-bookmark="jumpToBookmark"
      />

      <!--悬浮进度胶囊的 DOM-->
      <transition name="fade">
        <div
          v-if="isProgressIndicatorVisible && isToolbarVisible"
          class="floating-progress-indicator"
        >
          <div class="fpi-title">{{ previewChapterTitle }}</div>
          <div class="fpi-percent">{{ previewProgress }}</div>
        </div>
      </transition>

      <Teleport to="body">
        <transition name="fade">
          <div
            v-if="selectionMenuState.visible"
            ref="selectionPopupRef"
            class="selection-popup-menu"
            :style="{
              left: `${selectionPopupPosition.left}px`,
              top: `${selectionPopupPosition.top}px`,
              visibility: isSelectionPopupPositioned ? 'visible' : 'hidden'
            }"
            @mousedown.stop
          >
          <button
            class="sel-btn"
            @click="selectionMenuState.isOverlappingMark ? onRemoveHighlight() : onMarkHighlight()"
          >
            <span class="sel-icon">
              <svg v-if="selectionMenuState.isOverlappingMark" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.25" />
                <path d="m9 9 6 6M15 9l-6 6" />
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="m14.25 4.25 5.5 5.5" />
                <path
                  d="m5.25 13.25 8.9-8.9a1.75 1.75 0 0 1 2.47 0l3.03 3.03a1.75 1.75 0 0 1 0 2.47l-8.9 8.9-6.5 1z"
                />
                <path d="m5.25 13.25 5.5 5.5" />
              </svg>
            </span>
            <span class="sel-text">{{
              selectionMenuState.isOverlappingMark ? '取消标记' : '标记'
            }}</span>
          </button>

          <template v-if="selectionMenuState.overlapType !== 'annotate'">
            <div class="sel-divider"></div>
            <button class="sel-btn" @click="onMarkAnnotate">
              <span class="sel-icon">
                <svg viewBox="0 0 24 24">
                  <path
                    d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v7.5A2.75 2.75 0 0 1 16.25 16H11l-4.5 4v-4.2A2.75 2.75 0 0 1 5 13.25z"
                  />
                  <path d="M8.5 7.5h7M8.5 11h5" />
                </svg>
              </span>
              <span class="sel-text">批注</span>
            </button>
          </template>
          <template v-if="selectionMenuState.text">
            <div class="sel-divider"></div>
            <button class="sel-btn" @click="onMarkAsTitle">
              <span class="sel-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M5 5.5h14M12 5.5v13M8.5 18.5h7" />
                </svg>
              </span>
              <span class="sel-text">设为标题</span>
            </button>
          </template>
          </div>
        </transition>
      </Teleport>

      <!--下巴工具栏与设置面板-->
      <ReaderBottomBar
        @close-menus="closeAllSecondaryMenus"
        @prev-chapter="jumpPrevChapter"
        @next-chapter="jumpNextChapter"
        @progress-drag="onProgressDrag"
        @progress-change="onProgressChange"
        @press-slider="showCapsuleOnPress"
      />

      <TocSidebar @jump="jumpToChapter" @delete-items="deleteTocChapters" />

      <div class="reader-body">
        <div
          class="reader-content"
          :class="{
            'is-shifted': isAnnotationPanelOpen,
            'is-epub': currentBookType === 'epub' || currentBookType === 'mobi'
          }"
          @mousedown="onContentMouseDown"
          @mouseup="onContentMouseUp"
          @dblclick="onContentDoubleClick"
          @click="onContentClick"
        >
          <DynamicScroller
            v-show="currentBookType === 'txt' && readingMode === 'scroll' && lines.length > 0"
            class="scroller"
            :items="lines"
            :min-item-size="24"
            key-field="id"
            @scroll="onScroll"
            @wheel="onWheel"
          >
            <template #default="{ item, index, active }">
              <DynamicScrollerItem
                :item="item"
                :active="active"
                :size-dependencies="[item.text, hlTrigger]"
              >
                <div
                  class="line-item"
                  :data-index="index"
                  :data-raw-text="item.text"
                  :data-line-id="item.id"
                  :data-line-offset="item.approxOffset || 0"
                >
                  <template
                    v-for="(seg, idx) in getLineSegments(item)"
                    :key="idx + '-' + hlTrigger"
                  >
                    <mark
                      v-if="seg.type === 'mark'"
                      :class="[
                        'highlight-marker',
                        seg.markType === 'annotate' ? 'annotate-marker' : ''
                      ]"
                      :data-hl-id="seg.id"
                      >{{ seg.content }}</mark
                    >
                    <span v-else-if="seg.content">{{ seg.content }}</span>
                  </template>
                </div>
              </DynamicScrollerItem>
            </template>
          </DynamicScroller>

          <div
            v-show="
              currentBookType === 'txt' && readingMode === 'page' && currentTxtPageLines.length > 0
            "
            class="txt-page-view"
            @wheel.prevent="pageTxtBy($event.deltaY > 0 ? 1 : -1)"
          >
            <div
              v-for="(item, index) in currentTxtPageLines"
              :key="item.id + '-' + hlTrigger"
              class="line-item"
              :data-index="index"
              :data-raw-text="item.sourceText || item.text"
              :data-line-id="item.sourceLineId || item.id"
              :data-source-start="item.sourceStartIndex || 0"
              :data-line-offset="item.sourceOffset ?? item.approxOffset ?? 0"
            >
              <template v-for="(seg, idx) in getLineSegments(item)" :key="idx + '-' + hlTrigger">
                <mark
                  v-if="seg.type === 'mark'"
                  :class="[
                    'highlight-marker',
                    seg.markType === 'annotate' ? 'annotate-marker' : ''
                  ]"
                  :data-hl-id="seg.id"
                  >{{ seg.content }}</mark
                >
                <span v-else-if="seg.content">{{ seg.content }}</span>
              </template>
            </div>
          </div>

          <div v-show="currentBookType === 'epub'" class="epub-safe-wrapper">
            <div id="epub-viewer" class="epub-viewer"></div>
          </div>

          <div v-show="currentBookType === 'mobi'" class="epub-safe-wrapper">
            <div id="mobi-viewer" class="mobi-viewer"></div>
          </div>

          <div
            v-if="currentBookType === 'pdf'"
            class="pdf-continuous-container"
            :class="{ 'pdf-page-mode': readingMode === 'page' }"
            id="pdf-scroll-container"
            @wheel="onPdfWheel"
          >
            <div
              v-for="pageNum in pdfTotalPages"
              v-show="readingMode === 'scroll' || pageNum === currentPdfPage"
              :key="pageNum"
              :id="'pdf-page-wrapper-' + pageNum"
              class="pdf-page-wrapper"
              :data-page="pageNum"
            >
              <canvas :id="'pdf-canvas-' + pageNum" class="pdf-canvas"></canvas>
            </div>
          </div>

          <div v-if="isLoading && lines.length === 0" class="loading-state">...</div>
          <div v-if="!isLoading && !isParsing" class="global-progress-indicator">
            {{ readingProgressText }}
          </div>
        </div>

        <div
          v-if="isToolbarVisible"
          class="toolbar-dismiss-layer"
          @mousedown.stop.prevent
          @mouseup.stop.prevent
          @dblclick.stop.prevent
          @click.stop="dismissToolbarLayer"
          @wheel.stop="onToolbarDismissWheel"
        ></div>

        <AnnotationSidebar @edit="editAnnotation" @delete="deleteAnnotation" />
      </div>

      <AnnotationInput @cancel="cancelAnnotation" @confirm="confirmAnnotation" />
    </div>
  </div>

  <AppleModal />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

import AppleModal from './components/common/AppleModal.vue'
import WindowControls from './components/common/WindowControls.vue'

import { useSettings } from './composables/useSettings'
const { readerSettings, readerStyle, isFontMenuOpen } = useSettings()

import { useAnnotation } from './composables/useAnnotation'
const {
  hlTrigger,
  isTopMenuOpen,
  isHighlightMenuOpen,
  isAnnotationPanelOpen,
  isAnnotationInputOpen,
  selectionMenuState,
  groupedHighlights
} = useAnnotation()

import { useModal } from './composables/useModal'
const { modalState } = useModal()

const selectionPopupRef = ref<HTMLElement | null>(null)
const selectionPopupPosition = ref({ left: 8, top: 46 })
const isSelectionPopupPositioned = ref(false)

const updateSelectionPopupPosition = async (): Promise<void> => {
  if (!selectionMenuState.value.visible) {
    isSelectionPopupPositioned.value = false
    return
  }

  isSelectionPopupPositioned.value = false
  await nextTick()
  const popup = selectionPopupRef.value
  if (!popup) return

  const safeGap = 8
  const safeTop = 46
  const selectionGap = 12
  const popupRect = popup.getBoundingClientRect()
  const desiredLeft = selectionMenuState.value.x - popupRect.width / 2
  const anchorTop = selectionMenuState.value.anchorTop ?? selectionMenuState.value.y
  const anchorBottom = selectionMenuState.value.anchorBottom ?? anchorTop
  const desiredTop = anchorTop - popupRect.height - selectionGap
  const maxLeft = Math.max(safeGap, window.innerWidth - popupRect.width - safeGap)
  const maxTop = Math.max(safeTop, window.innerHeight - popupRect.height - safeGap)
  const canFitAbove = desiredTop >= safeTop
  const desiredVerticalPosition = canFitAbove ? desiredTop : anchorBottom + selectionGap

  selectionPopupPosition.value = {
    left: Math.min(Math.max(desiredLeft, safeGap), maxLeft),
    top: Math.min(Math.max(desiredVerticalPosition, safeTop), maxTop)
  }
  isSelectionPopupPositioned.value = true
}

watch(
  () => [
    selectionMenuState.value.visible,
    selectionMenuState.value.x,
    selectionMenuState.value.y,
    selectionMenuState.value.anchorTop,
    selectionMenuState.value.anchorBottom,
    selectionMenuState.value.text,
    selectionMenuState.value.isOverlappingMark,
    selectionMenuState.value.overlapType
  ],
  () => void updateSelectionPopupPosition(),
  { flush: 'post' }
)

onMounted(() => window.addEventListener('resize', updateSelectionPopupPosition))
onBeforeUnmount(() => window.removeEventListener('resize', updateSelectionPopupPosition))

import { useReader } from './composables/useReader'
const {
  currentView,
  currentBookType,
  isLoading,
  isParsing,
  isToolbarVisible,
  isSidebarOpen,
  isSettingsPanelOpen,
  readingMode,
  readingProgressText,
  isProgressIndicatorVisible,
  previewChapterTitle,
  previewProgress,
  lines,
  epubRendition,
  mobiView,
  currentPdfPage,
  pdfTotalPages
} = useReader()

import ShelfView from './components/shelf/ShelfView.vue'
import ReaderBottomBar from './components/reader/ReaderBottomBar.vue'
import AnnotationSidebar from './components/reader/AnnotationSidebar.vue'
import AnnotationInput from './components/reader/AnnotationInput.vue'
import ReaderTopBar from './components/reader/ReaderTopBar.vue'
import TocSidebar from './components/reader/TocSidebar.vue'

import { useEpubEngine } from './composables/useEpubEngine'
import { useTxtEngine } from './composables/useTxtEngine'
const {
  getExactOffset,
  loadNextChunk,
  loadPrevChunk,
  onScroll,
  onWheel,
  loadTxtBook,
  getLineSegments,
  onContentClick
} = useTxtEngine({
  autoSaveProgress: () => autoSaveProgress(),
  updateReadingStatus: () => updateReadingStatus(),
  hideToolbarOnScroll: () => hideToolbarOnScroll(),
  openAnnotationPanel: (id) => openAnnotationPanel(id)
})

import { useTxtPagination } from './composables/useTxtPagination'
const { currentTxtPageLines, pageTxtBy, rebuildTxtPages } = useTxtPagination({
  loadNextChunk,
  loadPrevChunk,
  getExactOffset,
  autoSaveProgress: () => autoSaveProgress(),
  updateReadingStatus: () => updateReadingStatus()
})

import { useReadingStatus } from './composables/useReadingStatus'
const { updateReadingStatus } = useReadingStatus({
  getExactOffset
})

import { useBookmark } from './composables/useBookmark'
const { isBookmarkMenuOpen } = useBookmark({
  getExactOffset
})

const {
  applyDashedUnderline,
  renderEpubHighlight,
  syncEpubHighlightPalette,
  applyEpubSettings,
  loadEpubBook,
  saveEpubPageAnchor
} = useEpubEngine({
  openAnnotationPanel: (id) => openAnnotationPanel(id),
  closeAllSecondaryMenus: () => closeAllSecondaryMenus(),
  toggleToolbar: () => toggleToolbar(),
  hideToolbarOnScroll: () => hideToolbarOnScroll(),
  autoSaveProgress: () => autoSaveProgress(),
  updateReadingStatus,
  onKeyDown: (event) => handleReaderKeydown(event)
})

import { useMobiEngine } from './composables/useMobiEngine'
const {
  loadMobiBook,
  renderMobiHighlight,
  removeMobiHighlight,
  saveMobiHighlights
} = useMobiEngine({
  autoSaveProgress: () => autoSaveProgress(),
  closeAllSecondaryMenus: () => closeAllSecondaryMenus(),
  toggleToolbar: () => toggleToolbar(),
  openAnnotationPanel: (id) => openAnnotationPanel(id),
  onKeyDown: (event) => handleReaderKeydown(event)
})

import { useAnnotationActions } from './composables/useAnnotationActions'
const {
  onRemoveHighlight,
  onMarkHighlight,
  onMarkAnnotate,
  onMarkAsTitle,
  confirmAnnotation,
  cancelAnnotation,
  openAnnotationPanel,
  deleteAnnotation,
  editAnnotation
} = useAnnotationActions({
  getExactOffset,
  renderEpubHighlight,
  syncEpubHighlightPalette,
  renderMobiHighlight,
  removeMobiHighlight,
  saveMobiHighlights
})

import { useManualToc } from './composables/useManualToc'
const { deleteTocChapters } = useManualToc({ getExactOffset })

import { usePdfEngine } from './composables/usePdfEngine'
const { loadPdfBook, goToPdfPage, pagePdfBy, onPdfWheel, jumpToPdfDestination } =
  usePdfEngine({
    autoSaveProgress: () => autoSaveProgress(),
    updateReadingStatus
  })

import { useBookImport } from './composables/useBookImport'
const { handleScanBooks } = useBookImport()

import { useBookOpen } from './composables/useBookOpen'
const { openBook } = useBookOpen({
  loadEpubBook,
  loadMobiBook,
  loadPdfBook,
  loadTxtBook
})

import { useReadingSession } from './composables/useReadingSession'
const { autoSaveProgress, goShelf, deleteCurrentBook } = useReadingSession({
  getExactOffset,
  saveEpubPageAnchor
})

import { useReaderUiController } from './composables/useReaderUiController'
const { closeAllSecondaryMenus, closeSecondaryMenusToToolbar, hideToolbarOnScroll, toggleToolbar } =
  useReaderUiController({
    applyDashedUnderline,
    applyEpubSettings
  })

const dismissToolbarLayer = (): void => {
  if (!closeSecondaryMenusToToolbar()) toggleToolbar()
}

const onToolbarDismissWheel = async (event: WheelEvent): Promise<void> => {
  event.preventDefault()
  hideToolbarOnScroll()
  selectionMenuState.value.visible = false

  if (event.deltaY === 0) return
  const direction = event.deltaY > 0 ? 1 : -1

  if (currentBookType.value === 'txt') {
    if (readingMode.value === 'page') {
      pageTxtBy(direction)
      return
    }
    document.querySelector<HTMLElement>('.scroller')?.scrollBy({
      top: event.deltaY,
      left: event.deltaX
    })
    return
  }

  if (currentBookType.value === 'pdf') {
    if (readingMode.value === 'page') {
      pagePdfBy(direction)
      return
    }
    document.querySelector<HTMLElement>('.pdf-continuous-container')?.scrollBy({
      top: event.deltaY,
      left: event.deltaX
    })
    return
  }

  if (currentBookType.value === 'mobi') {
    await (direction > 0 ? mobiView.value?.next() : mobiView.value?.prev())
    return
  }

  if (currentBookType.value !== 'epub') return
  if (readingMode.value === 'page') {
    await (direction > 0 ? epubRendition.value?.next() : epubRendition.value?.prev())
    return
  }

  const scrollContainer = document.querySelector<HTMLElement>('.epub-container')
  if (!scrollContainer) return

  const isAtBottom =
    Math.ceil(scrollContainer.scrollTop + scrollContainer.clientHeight) >=
    scrollContainer.scrollHeight - 5
  const isAtTop = scrollContainer.scrollTop <= 5

  if (direction > 0 && isAtBottom) {
    await epubRendition.value?.next()
    document.querySelector<HTMLElement>('.epub-container')?.scrollTo({ top: 0 })
    return
  }

  if (direction < 0 && isAtTop) {
    await epubRendition.value?.prev()
    const previousContainer = document.querySelector<HTMLElement>('.epub-container')
    previousContainer?.scrollTo({ top: previousContainer.scrollHeight })
    return
  }

  scrollContainer.scrollBy({ top: event.deltaY, left: event.deltaX })
}

import { useReaderNavigation } from './composables/useReaderNavigation'
const {
  showCapsuleOnPress,
  jumpToChapter,
  jumpToHighlight,
  jumpToBookmark,
  onProgressChange,
  jumpPrevChapter,
  jumpNextChapter,
  onProgressDrag
} = useReaderNavigation({
  getExactOffset,
  loadNextChunk,
  rebuildTxtPages,
  goToPdfPage,
  jumpToPdfDestination,
  applyDashedUnderline,
  autoSaveProgress: () => autoSaveProgress(),
  updateReadingStatus,
  closeAllSecondaryMenus: () => closeAllSecondaryMenus()
})

import { useContentSelection } from './composables/useContentSelection'
const { onContentMouseDown, onContentMouseUp, onContentDoubleClick } = useContentSelection({
  closeAllSecondaryMenus,
  toggleToolbar,
  pageTxtBy,
  pagePdfBy
})

import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts'
const { syncBossKey } = useKeyboardShortcuts()

const isEditableShortcutTarget = (target: EventTarget | null): boolean => {
  const element = target as (Element & { closest?: (selector: string) => Element | null }) | null
  if (!element || typeof element.closest !== 'function') return false
  return Boolean(
    element.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="slider"]'
    )
  )
}

const hasOpenReaderLayer = (): boolean =>
  modalState.value.visible ||
  isAnnotationInputOpen.value ||
  isAnnotationPanelOpen.value ||
  selectionMenuState.value.visible ||
  isSidebarOpen.value ||
  isSettingsPanelOpen.value ||
  isFontMenuOpen.value ||
  isTopMenuOpen.value ||
  isHighlightMenuOpen.value ||
  isBookmarkMenuOpen.value

const scrollElementByKeyboard = (element: Element, direction: -1 | 1): void => {
  const scrollElement = element as HTMLElement
  const distance = Math.max(80, Math.round(scrollElement.clientHeight * 0.18))
  scrollElement.scrollBy({ top: direction * distance })
}

const scrollReaderByKeyboard = (event: KeyboardEvent, direction: -1 | 1): boolean => {
  if (currentBookType.value === 'txt') {
    const scroller = document.querySelector<HTMLElement>('.scroller')
    if (!scroller) return false
    scrollElementByKeyboard(scroller, direction)
    return true
  }

  if (currentBookType.value === 'pdf') {
    const scroller = document.querySelector<HTMLElement>('.pdf-continuous-container')
    if (!scroller) return false
    scrollElementByKeyboard(scroller, direction)
    return true
  }

  if (currentBookType.value === 'epub') {
    const scroller = document.querySelector<HTMLElement>('.epub-container')
    if (!scroller) return false
    const isAtTop = scroller.scrollTop <= 2
    const isAtBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
    if (direction < 0 && isAtTop) {
      void epubRendition.value?.prev().then(() => {
        const previousScroller = document.querySelector<HTMLElement>('.epub-container')
        previousScroller?.scrollTo({ top: previousScroller.scrollHeight })
      })
    } else if (direction > 0 && isAtBottom) {
      void epubRendition.value?.next().then(() => {
        document.querySelector<HTMLElement>('.epub-container')?.scrollTo({ top: 0 })
      })
    } else {
      scrollElementByKeyboard(scroller, direction)
    }
    return true
  }

  if (currentBookType.value === 'mobi') {
    const targetNode = event.target as Node | null
    const scroller = targetNode?.ownerDocument?.scrollingElement as HTMLElement | null
    if (!scroller) return false
    const isAtTop = scroller.scrollTop <= 2
    const isAtBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
    if (direction < 0 && isAtTop) void mobiView.value?.prev()
    else if (direction > 0 && isAtBottom) void mobiView.value?.next()
    else scrollElementByKeyboard(scroller, direction)
    return true
  }

  return false
}

function handleReaderKeydown(event: KeyboardEvent): boolean {
  if (event.key === 'Escape') {
    if (modalState.value.visible) {
      modalState.value.onCancel()
      return true
    }
    if (isAnnotationInputOpen.value) {
      cancelAnnotation()
      return true
    }
    if (selectionMenuState.value.visible) {
      selectionMenuState.value.visible = false
      window.getSelection()?.removeAllRanges()
      return true
    }
    if (isAnnotationPanelOpen.value) {
      isAnnotationPanelOpen.value = false
      return true
    }
    return closeSecondaryMenusToToolbar()
  }

  if (
    currentView.value !== 'reader' ||
    isLoading.value ||
    isParsing.value ||
    hasOpenReaderLayer() ||
    isEditableShortcutTarget(event.target) ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return false
  }

  if (readingMode.value === 'scroll') {
    if (event.key === 'ArrowUp') return scrollReaderByKeyboard(event, -1)
    if (event.key === 'ArrowDown') return scrollReaderByKeyboard(event, 1)
    return false
  }

  let direction: -1 | 1 | null = null
  if (event.key === 'ArrowLeft') direction = -1
  if (event.key === 'ArrowRight' || event.key === ' ') direction = 1
  if (!direction) return false

  if (currentBookType.value === 'txt') pageTxtBy(direction)
  else if (currentBookType.value === 'pdf') pagePdfBy(direction)
  else if (currentBookType.value === 'epub') {
    void (direction > 0 ? epubRendition.value?.next() : epubRendition.value?.prev())
  } else if (currentBookType.value === 'mobi') {
    void (direction > 0 ? mobiView.value?.next() : mobiView.value?.prev())
  }
  return true
}

const onWindowKeydown = (event: KeyboardEvent): void => {
  if (handleReaderKeydown(event)) event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown)
  void syncBossKey()
})

onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))
</script>

<style scoped>
/* ==========================================
   1. 基础布局 & Apple 级背景字体
   ========================================== */
.app-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 9px;
  background: #e9eaec;
  font-family:
    -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif;
  box-shadow: 0 10px 34px rgba(29, 29, 31, 0.14);
}

.app-window-bar {
  display: flex;
  flex: 0 0 38px;
  align-items: stretch;
  background: #f0f0f2;
}

.app-drag-region {
  display: flex;
  flex: 1;
  align-items: center;
  padding-left: 14px;
  -webkit-app-region: drag;
}

/* ==========================================
   3. 阅读器本体 (沉浸式高级重构)
   ========================================== */
.reader-view {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  margin: 0 8px 8px;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.055);
  border-radius: 0 0 10px 10px;
  /* 🌟 核心接入：背景色、滤镜和文字颜色全部交由 CSS 变量控制 */
  background: var(--reader-bg, #ffffff) !important;
  background-size: cover !important;
  background-position: center !important;
  color: var(--reader-color);
  filter: brightness(var(--reader-brightness, 100%));
  transition:
    background 0.4s ease,
    filter 0.3s,
    color 0.3s;
  overflow: hidden;
  box-shadow: 0 16px 44px rgba(29, 29, 31, 0.1);
}

.reader-view.is-night-mode {
  border-color: rgba(255, 255, 255, 0.06);
  box-shadow: 0 16px 44px rgba(0, 0, 0, 0.24);
}

/* 🌟 沉浸式阅读区 (四周留白) */
.reader-body {
  position: relative;
  flex: 1;
  height: 0;
  width: 100%;
  overflow: hidden;
}

.toolbar-dismiss-layer {
  position: absolute;
  inset: 0;
  z-index: 35;
  cursor: default;
}

.reader-content {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  padding: 0;
  /* 默认开启平滑动画，大屏下因为文字宽度不被挤压，滑动会极其丝滑且不跳段 */
  transition: right 0.25s cubic-bezier(0.25, 0.8, 0.2, 1);
}

.reader-content.is-shifted {
  right: 344px;
}

/* EPUB 调整尺寸时只做一次重排。宽度动画会在每一帧触发重新分页，反而造成卡顿
   和闪烁。TXT/PDF 仍保留原有的抽屉动效。 */
.reader-content.is-epub {
  transition: none;
}

/* 窄屏下关闭其他格式的过渡，减少正文宽度变化时的连续重排。 */
@media (max-width: 1320px) {
  .reader-content {
    transition: none !important;
  }
}

/* ==========================================
   🌟 全局 Mac 风格悬浮滚动条 (完美触发版)
   ========================================== */
:deep(::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

:deep(::-webkit-scrollbar-track) {
  background: transparent;
}

/* 1. 默认状态：完全隐形 */
:deep(::-webkit-scrollbar-thumb) {
  background: transparent;
  border-radius: 10px;
}

/* 2. 核心修复：把悬停雷达绑定在“容器”上！ */
/* 只要鼠标停留在阅读主体、PDF框、或是侧边目录上，滚动条就现身 */
.reader-content:hover :deep(::-webkit-scrollbar-thumb),
.pdf-viewer:hover :deep(::-webkit-scrollbar-thumb),
.toc-sidebar:hover :deep(::-webkit-scrollbar-thumb) {
  background: rgba(0, 0, 0, 0.15);
}

/* 夜间模式滚动条调整为白色半透明 */
.is-night-mode .reader-content:hover :deep(::-webkit-scrollbar-thumb),
.is-night-mode .pdf-viewer:hover :deep(::-webkit-scrollbar-thumb),
.is-night-mode .toc-sidebar:hover :deep(::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.15);
}

/* 3. 当鼠标精准捏住滚动条本体时，颜色加深 */
:deep(::-webkit-scrollbar-thumb:hover) {
  background: rgba(0, 0, 0, 0.35) !important;
}
.is-night-mode :deep(::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.3) !important;
}

/* 彻底干掉上下左右的原生小箭头 */
:deep(::-webkit-scrollbar-button) {
  display: none !important;
}

/* 🌟 3. 全局高级细线滚动条 (针对 TXT, PDF, 目录侧边栏) */
.scroller::-webkit-scrollbar,
.pdf-viewer::-webkit-scrollbar,
.toc-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scroller::-webkit-scrollbar-track,
.pdf-viewer::-webkit-scrollbar-track,
.toc-list::-webkit-scrollbar-track {
  background: transparent;
}
.scroller::-webkit-scrollbar-thumb,
.pdf-viewer::-webkit-scrollbar-thumb,
.toc-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15); /* 平时是极其淡的颜色 */
  border-radius: 10px;
}
.scroller::-webkit-scrollbar-thumb:hover,
.pdf-viewer::-webkit-scrollbar-thumb:hover,
.toc-list::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3); /* 鼠标悬浮时稍微变深 */
}

/* ==========================================
   引擎细调与动画
   ========================================== */
.epub-viewer {
  width: 100%;
  height: 100%;
}

.mobi-viewer,
.foliate-reader {
  display: block;
  width: 100%;
  height: 100%;
}

.line-item {
  min-height: 24px;
  /* 🌟 核心接入：大小、间距、字体全部交由 CSS 变量控制 */
  line-height: var(--reader-line-height, 1.8) !important;
  padding: 4px 0;
  font-size: var(--reader-font-size, 17px) !important;
  font-family: var(--reader-font-family, inherit) !important;
  color: var(--reader-color, #1d1d1f);
  white-space: pre-wrap;
  word-break: break-all;
}

/* 弹窗与抽屉的丝滑过渡动画 */
.slide-top-enter-active,
.slide-top-leave-active,
.slide-left-enter-active,
.slide-left-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.25, 0.8, 0.2, 1),
    opacity 0.3s ease;
}

.slide-top-enter-from,
.slide-top-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
.slide-bottom-enter-from,
.slide-bottom-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

.pdf-viewer {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: transparent; /* PDF 外层跟随大背景 */
  position: relative;
}

.pdf-page-indicator {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 5px 15px;
  border-radius: 20px;
  font-size: 14px;
  pointer-events: none;
}

/* 🌟 核心改造 4：瀑布流滚动条与样式 */
.pdf-continuous-container {
  width: 100%;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  background-color: transparent; /* 允许外部背景色透过来 */
}

.pdf-continuous-container.pdf-page-mode {
  height: 100%;
  overflow: hidden;
  justify-content: center;
}

.pdf-page-mode .pdf-page-wrapper {
  margin: 0;
  height: 100%;
  align-items: center;
}

.pdf-page-wrapper {
  margin: 15px 0; /* 上下页之间的漂亮留白 */
  display: flex;
  justify-content: center;
  width: 100%;
}

.pdf-canvas {
  background-color: white; /* 依然保持纸张的白色 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* 纸张的高级阴影 */
  max-width: 95%;
}
.is-night-mode .pdf-canvas {
  filter: invert(0.88) hue-rotate(180deg) contrast(0.9);
}

/* --- UI 交互优化 --- */
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 15px;
  min-width: 150px;
}
.header-right {
  justify-content: flex-end;
}

.toggle-sidebar-btn {
  background: transparent;
  border: 1px solid #ddd;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  color: #555;
  font-size: 14px;
  display: flex;
  align-items: center;
  transition: all 0.2s ease;
}

.toggle-sidebar-btn:hover {
  background: #e6f7ff;
  border-color: #91d5ff;
  color: #007bff;
}

/* 书本进度指示器 */
.global-progress-indicator {
  position: absolute;
  right: 30px;
  bottom: 25px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  color: #333;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-family: Consolas, monospace;
  pointer-events: none;
  z-index: 30;
  transition: opacity 0.3s ease;
}
.is-night-mode .global-progress-indicator {
  background: rgba(30, 30, 32, 0.85);
  color: #ccc;
  border-color: rgba(255, 255, 255, 0.05);
}

.pdf-viewer ~ .global-progress-indicator {
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* ==========================================
   🌟 压轴新增：高级悬浮设置面板 (拒绝毛玻璃遮挡)
   ========================================== */

/* 字体选择下拉框 */
.apple-select {
  flex: 1;
  padding: 8px 12px;
  border-radius: 10px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  font-size: 14px;
  outline: none;
  color: inherit;
  cursor: pointer;
}
.is-night-mode .apple-select {
  background: rgba(255, 255, 255, 0.06);
}

.font-dropdown-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 99; /* 必须低于下拉框的100，但高于面板的50 */
  background: transparent;
}

/* ==========================================
   设置：主题背景圆点外置光环
   ========================================== */
.active-theme {
  outline: 2px solid #007aff; /* 苹果专属蓝色 */
  outline-offset: 3px; /* 让光环浮在外面，极其精致 */
}

/* ==========================================
   TXT 专属沉浸式深度缩进
   ========================================== */
/* 因为 .scroller 专门负责装载 TXT，我们直接给 TXT 所在的容器加厚内边距 */
.scroller {
  width: 100%;
  height: 100%;
  padding: 0 4vw;
  box-sizing: border-box;
}
.scroller .line-item {
  max-width: 900px;
  margin: 0 auto;
}
.txt-page-view {
  width: 100%;
  height: 100%;
  padding: 0 4vw;
  box-sizing: border-box;
  overflow: hidden;
}
.txt-page-view .line-item {
  max-width: 900px;
  margin: 0 auto;
  padding-top: 0;
  padding-bottom: 0;
}
.epub-safe-wrapper {
  width: 100%;
  height: 100%;
  max-width: 1000px;
  margin: 0 auto;
}

/* ==========================================
   🌟 悬浮进度提示胶囊 (石墨灰高级毛玻璃)
   ========================================== */
.floating-progress-indicator {
  position: absolute;
  /* 悬浮于工具栏 64px 之上，加上合适的间距 */
  bottom: 84px;
  left: 50%;
  transform: translateX(-50%);
  width: 400px;

  /* 纯正石墨灰 + 极致毛玻璃 */
  background: rgba(60, 60, 61, 0.85);
  backdrop-filter: blur(25px);
  -webkit-backdrop-filter: blur(25px);
  border-radius: 16px;
  padding: 18px 20px;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  z-index: 50;

  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.08);

  /* 👈 核心：让鼠标点击直接穿透胶囊，点到背景即可关闭菜单！ */
  pointer-events: none;
}

/* 标题行：加粗显示正在前往的章节 */
.fpi-title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  width: 100%;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.02em;
}

/* 进度行 */
.fpi-percent {
  font-size: 16px;
  font-weight: 700;
  color: #b4b4b5;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

/* ==========================================
   🌟 划词选中悬浮弹窗 (黑色气泡)
   ========================================== */
.reader-view ::selection {
  background: var(--reader-selection-bg);
  color: inherit;
}

.selection-popup-menu {
  position: fixed;
  max-width: calc(100vw - 16px);
  box-sizing: border-box;
  background: rgba(38, 38, 47, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  padding: 6px;
  display: flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  z-index: 999;

  /* 防止在屏幕边缘被挤压变形 */
  white-space: nowrap;
  overflow-x: auto;
}

/* 按钮改为上下结构 */
.sel-btn {
  background: transparent;
  border: none;
  color: #fff;
  padding: 6px 16px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: background 0.2s;
}
.sel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.sel-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
}

.sel-icon svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sel-text {
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
}

.sel-divider {
  width: 1px;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
}

@media (max-width: 420px) {
  .sel-btn {
    padding-inline: 11px;
  }
}

/* ==========================================
   🌟 荧光笔标记效果 (占位类，供将来逻辑包裹使用)
   ========================================== */
.highlight-marker {
  background-color: var(--reader-highlight-bg, rgba(120, 120, 120, 0.35));
  border-radius: 4px;
  padding: 2px 0;
  cursor: pointer;
  color: #000 !important;
}

/* 👇 核心防加深 2：魔法级 CSS 穿透。
   如果发生高亮套娃，里面的高亮自动变为透明，绝不发生颜色叠加变暗！ */
.highlight-marker .highlight-marker {
  background-color: transparent !important;
}

/* ==========================================
   🌟 批注系统：红线
   ========================================== */
/* TXT 的红线批注标记 */
/* TXT 的红线批注标记 */
.annotate-marker {
  background-color: transparent !important;
  border-bottom: 2px dashed #ff3b30 !important;
  border-radius: 0;
  padding-bottom: 2px;
  color: inherit !important;
  /* 👇 加上这两句，确保红线永远在最上层，绝对不会被黄底压住 */
  position: relative;
  z-index: 10;
}
.is-night-mode .annotate-marker {
  border-bottom-color: #ff453a !important;
}
</style>
