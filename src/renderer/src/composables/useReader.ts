// src/renderer/src/composables/useReader.ts
//剩下的阅读器视图状态与核心引擎状态。这个模块的职责是维护当前打开的书籍信息、阅读进度、目录列表、以及针对不同引擎（TXT、EPUB、PDF）的专属状态变量等。通过集中管理这些状态，我们可以确保阅读器视图和功能的一致性，同时也为后续的功能扩展（如批注、书签等）提供了坚实的基础。
import { ref, shallowRef } from 'vue'
import type { Book, Rendition } from 'epubjs'
import type { FoliateViewElement } from 'foliate-js/view.js'

// 1. 抽离列表项接口
export interface LineItem {
  id: string
  text: string
  approxOffset?: number
  sourceLineId?: string
  sourceText?: string
  sourceStartIndex?: number
  sourceOffset?: number
}

export interface TOCItem {
  title: string
  titleStart?: number
  titleEnd?: number
  href?: string
  id?: string
  depth?: number
  parentIds?: string[]
  hasChildren?: boolean
  pdfDest?: string | unknown[] | null
  pageNumber?: number
  cfi?: string
  manualId?: string
  tocOrder?: number
}

// 🌟 构建全局单例状态池
const currentView = ref<'shelf' | 'reader'>('shelf')
const currentBookTitle = ref('')
const currentBookPath = ref('')
const currentTime = ref('')

// 引擎通用状态
const currentBookType = ref<'txt' | 'epub' | 'pdf' | 'mobi'>('txt')
const isLoading = ref(false)
const isParsing = ref(false)
const tocList = ref<TOCItem[]>([])
const fileSize = ref(0)

// 视图与菜单开关状态
const isSidebarOpen = ref(false)
const isToolbarVisible = ref(false)
const isSettingsPanelOpen = ref(false)
const readingProgressText = ref('0.00%')
const activeChapterTitle = ref('')
const sliderProgress = ref(0)

// 悬浮进度胶囊状态
const isProgressIndicatorVisible = ref(false)
const previewChapterTitle = ref('')
const previewProgress = ref('0.00%')

// TXT 引擎专属状态
const lines = ref<LineItem[]>([])
const isEndReached = ref(false)
const isTopReached = ref(false)
const isJumping = ref(false)
const topOffset = ref(0)
const bottomOffset = ref(0)
const currentEncoding = ref('utf-8')
const leftoverText = ref('')
const topLeftoverText = ref('')
const currentTxtPageAnchor = ref(0)

// EPUB 引擎专属状态
const epubBook = shallowRef<Book | null>(null)
const epubRendition = shallowRef<Rendition | null>(null)
const epubCfi = ref('')

// MOBI / AZW3 引擎专属状态
const mobiView = shallowRef<FoliateViewElement | null>(null)
const mobiLocation = ref('')

// PDF 引擎专属状态
const currentPdfPage = ref(1)
const pdfTotalPages = ref(0)

// 每本书会在打开时恢复自己的阅读模式；未设置书籍默认使用滚动模式。
const readingMode = ref<'scroll' | 'page'>('scroll')

export function useReader() {
  return {
    currentView,
    currentBookTitle,
    currentBookPath,
    currentTime,
    currentBookType,
    isLoading,
    isParsing,
    tocList,
    fileSize,
    isSidebarOpen,
    isToolbarVisible,
    isSettingsPanelOpen,
    readingProgressText,
    activeChapterTitle,
    sliderProgress,
    isProgressIndicatorVisible,
    previewChapterTitle,
    previewProgress,
    lines,
    isEndReached,
    isTopReached,
    isJumping,
    topOffset,
    bottomOffset,
    currentEncoding,
    leftoverText,
    topLeftoverText,
    currentTxtPageAnchor,
    epubBook,
    epubRendition,
    epubCfi,
    mobiView,
    mobiLocation,
    currentPdfPage,
    pdfTotalPages,
    readingMode
  }
}
