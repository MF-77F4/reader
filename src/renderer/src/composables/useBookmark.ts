import { computed, ref, watch } from 'vue'
import { useReader } from './useReader'

export interface Bookmark {
  id: string
  type: 'txt' | 'epub' | 'pdf' | 'mobi'
  anchor: number | string
  chapterTitle: string
  snippet: string
  createdAt: number
}

interface BookmarkOptions {
  getExactOffset?: () => number
}

const isBookmarkMenuOpen = ref(false)
const bookmarks = ref<Bookmark[]>([])
const bookmarkSortOrder = ref<'asc' | 'desc'>('asc')
let loadedBookPath = ''
let registeredGetExactOffset: (() => number) | undefined

export function useBookmark(options: BookmarkOptions = {}) {
  if (options.getExactOffset) registeredGetExactOffset = options.getExactOffset
  const {
    currentBookPath,
    currentBookType,
    activeChapterTitle,
    lines,
    epubRendition,
    epubCfi,
    mobiLocation,
    currentPdfPage
  } = useReader()

  const getStorageKey = (path = currentBookPath.value) => `bookmarks_${path}`

  const loadBookmarks = () => {
    if (!currentBookPath.value) {
      loadedBookPath = ''
      bookmarks.value = []
      return
    }

    loadedBookPath = currentBookPath.value
    const saved = localStorage.getItem(getStorageKey())
    if (!saved) {
      bookmarks.value = []
      return
    }

    try {
      bookmarks.value = JSON.parse(saved)
    } catch {
      bookmarks.value = []
    }
  }

  const ensureCurrentBookLoaded = () => {
    if (loadedBookPath !== currentBookPath.value) loadBookmarks()
  }

  const saveBookmarks = () => {
    if (!currentBookPath.value) return
    localStorage.setItem(getStorageKey(), JSON.stringify(bookmarks.value))
  }

  const getTxtSnippet = (anchor: number) => {
    const nearestLine = lines.value.reduce<(typeof lines.value)[number] | null>((nearest, line) => {
      if (!nearest) return line
      return Math.abs((line.approxOffset ?? 0) - anchor) <
        Math.abs((nearest.approxOffset ?? 0) - anchor)
        ? line
        : nearest
    }, null)

    return nearestLine?.text.trim().slice(0, 80) || 'TXT 阅读位置'
  }

  const isSameLocation = (bookmark: Bookmark, anchor: number | string) => {
    if (bookmark.type !== currentBookType.value) return false
    if (typeof anchor === 'number' && typeof bookmark.anchor === 'number') {
      return Math.abs(bookmark.anchor - anchor) < 200
    }
    return bookmark.anchor === anchor
  }

  const getCurrentAnchor = (): number | string | null => {
    if (currentBookType.value === 'txt') return registeredGetExactOffset?.() ?? null
    if (currentBookType.value === 'epub') {
      return epubRendition.value?.location?.start?.cfi || epubCfi.value || null
    }
    if (currentBookType.value === 'pdf') return currentPdfPage.value
    if (currentBookType.value === 'mobi') return mobiLocation.value || null
    return null
  }

  const addCurrentBookmark = () => {
    ensureCurrentBookLoaded()
    const anchor = getCurrentAnchor()
    if (anchor === null || bookmarks.value.some((bookmark) => isSameLocation(bookmark, anchor))) return

    const snippet =
      currentBookType.value === 'txt'
        ? getTxtSnippet(Number(anchor))
        : currentBookType.value === 'pdf'
          ? `第 ${anchor} 页`
          : activeChapterTitle.value || '电子书阅读位置'

    bookmarks.value.push({
      id: `bookmark-${Date.now()}`,
      type: currentBookType.value,
      anchor,
      chapterTitle:
        activeChapterTitle.value || (currentBookType.value === 'pdf' ? `第 ${anchor} 页` : '未命名位置'),
      snippet,
      createdAt: Date.now()
    })
    saveBookmarks()
  }

  const deleteBookmark = (id: string) => {
    ensureCurrentBookLoaded()
    bookmarks.value = bookmarks.value.filter((bookmark) => bookmark.id !== id)
    saveBookmarks()
  }

  const sortedBookmarks = computed(() => {
    const direction = bookmarkSortOrder.value === 'asc' ? 1 : -1
    return [...bookmarks.value].sort((left, right) => {
      if (typeof left.anchor === 'number' && typeof right.anchor === 'number') {
        return (left.anchor - right.anchor) * direction
      }
      return left.createdAt === right.createdAt
        ? 0
        : (left.createdAt - right.createdAt) * direction
    })
  })

  watch(currentBookPath, () => {
    loadBookmarks()
    isBookmarkMenuOpen.value = false
  })

  return {
    isBookmarkMenuOpen,
    bookmarks,
    bookmarkSortOrder,
    sortedBookmarks,
    loadBookmarks,
    addCurrentBookmark,
    deleteBookmark
  }
}
