import { ref, computed, watch } from 'vue'
import { EpubCFI } from 'epubjs'
import { useReader } from './useReader'

// ==========================================
// 1. 原汁原味的数据结构恢复
// ==========================================

export interface TxtHighlight {
  id: string
  lineText: string
  startIndex: number
  endIndex: number
  text: string
  offset: number
  timestamp: number
  type?: 'highlight' | 'annotate' // 保持原有设计
  note?: string
}

export function getTxtHighlightText(highlight: TxtHighlight): string {
  if (typeof highlight.text === 'string' && highlight.text.length > 0) return highlight.text
  if (typeof highlight.lineText !== 'string') return ''

  const start = Number.isFinite(highlight.startIndex) ? Math.max(0, highlight.startIndex) : 0
  const end = Number.isFinite(highlight.endIndex)
    ? Math.min(highlight.lineText.length, highlight.endIndex)
    : start
  return end > start ? highlight.lineText.substring(start, end) : ''
}

export interface LineSegment {
  type: 'text' | 'mark'
  content: string
  id?: string
  markType?: 'highlight' | 'annotate' // 恢复 markType 以配合渲染引擎
}

export interface HighlightData {
  id: string
  cfis: string[]
  text: string
  timestamp: number
  type?: 'highlight' | 'annotate'
  note?: string
  chapterTitle?: string
  chapterOrder?: number
}

// ==========================================
// 2. 原汁原味的全局状态恢复
// ==========================================

const isTopMenuOpen = ref(false)
const isHighlightMenuOpen = ref(false)
const activeHighlightChapter = ref('')
const highlightChapterSortOrder = ref<'asc' | 'desc'>('asc')
const sidebarTab = ref<'toc' | 'highlight'>('toc')

const txtHighlights = ref<TxtHighlight[]>([])
const epubHighlights = ref<HighlightData[]>([])
const hlTrigger = ref(0)

const isAnnotationPanelOpen = ref(false)
const isAnnotationInputOpen = ref(false)
const annotationInputText = ref('')
const draftAnnotationData = ref<any>(null)
const currentViewingNote = ref<{id: string, snippet: string, note: string, time: string} | null>(null)

interface SelectionMenuState {
  visible: boolean
  x: number
  y: number
  anchorTop?: number
  anchorBottom?: number
  text: string
  isOverlappingMark: boolean
  overlapType: string
  targetCfis: string[]
}

// 🌟 完全恢复你最初定义的 selectionMenuState，找回 targetCfis 的双端共用能力和 overlapType
const selectionMenuState = ref<SelectionMenuState>({
  visible: false,
  x: 0,
  y: 0,
  text: '',
  isOverlappingMark: false,
  overlapType: 'none',
  targetCfis: [] as string[]
})

const currentSelectionRange = ref<Range | null>(null)
const currentSelectionCfi = ref('')
const currentSelectionCfis = ref<string[]>([])
const currentTxtSelection = ref<{ lineText: string, startIndex: number, endIndex: number, offset?: number }[]>([])
export function useAnnotation() {
  const { currentBookType, tocList, epubBook } = useReader()

  const normalizeEpubHref = (href?: string) => {
    if (!href) return ''

    let normalized = href.split('#')[0].split('?')[0].replace(/\\/g, '/')
    try {
      normalized = decodeURIComponent(normalized)
    } catch {
      // Keep the original path when the EPUB contains malformed escape sequences.
    }

    return normalized.replace(/^(\.\/|\.\.\/|\/)+/, '').toLowerCase()
  }

  const isSameEpubHref = (left?: string, right?: string) => {
    const normalizedLeft = normalizeEpubHref(left)
    const normalizedRight = normalizeEpubHref(right)
    if (!normalizedLeft || !normalizedRight) return false

    return (
      normalizedLeft === normalizedRight ||
      normalizedLeft.endsWith(`/${normalizedRight}`) ||
      normalizedRight.endsWith(`/${normalizedLeft}`)
    )
  }

  const getEpubSectionByHref = (href?: string) => {
    if (!href || !epubBook.value) return null

    const directMatch = epubBook.value.spine.get(href)
    if (directMatch) return directMatch

    let normalizedMatch: ReturnType<typeof epubBook.value.spine.get> | null = null
    epubBook.value.spine.each((section) => {
      if (!normalizedMatch && isSameEpubHref(href, section.href)) normalizedMatch = section
    })
    return normalizedMatch
  }

  const getEpubChapterInfo = (anchor?: string) => {
    const fallback = { title: '未分类笔记', order: Number.MAX_SAFE_INTEGER }
    if (!anchor || !epubBook.value) return fallback

    try {
      const section = epubBook.value.spine.get(anchor)
      if (!section) return fallback

      const exactIndex = tocList.value.findIndex((item) => isSameEpubHref(item.href, section.href))
      if (exactIndex >= 0) {
        return { title: tocList.value[exactIndex].title, order: exactIndex }
      }

      let nearestInfo = fallback
      let nearestSpineIndex = -1
      tocList.value.forEach((item, tocIndex) => {
        if (!item.href) return
        const tocSection = getEpubSectionByHref(item.href)
        if (
          tocSection &&
          tocSection.index <= section.index &&
          tocSection.index > nearestSpineIndex
        ) {
          nearestSpineIndex = tocSection.index
          nearestInfo = { title: item.title, order: tocIndex }
        }
      })
      return nearestInfo
    } catch {
      return fallback
    }
  }

  const enrichEpubHighlightChapters = () => {
    let hasChanges = false

    epubHighlights.value.forEach((highlight) => {
      const chapterInfo = getEpubChapterInfo(highlight.cfis[0])
      if (chapterInfo.title === '未分类笔记') return

      if (
        highlight.chapterTitle !== chapterInfo.title ||
        highlight.chapterOrder !== chapterInfo.order
      ) {
        highlight.chapterTitle = chapterInfo.title
        highlight.chapterOrder = chapterInfo.order
        hasChanges = true
      }
    })

    return hasChanges
  }

  const compareHighlightsByReadingOrder = (
    left: { jumpAnchor: string | number },
    right: { jumpAnchor: string | number }
  ) => {
    if (currentBookType.value === 'txt') {
      return Number(left.jumpAnchor) - Number(right.jumpAnchor)
    }

    try {
      return new EpubCFI().compare(String(left.jumpAnchor), String(right.jumpAnchor))
    } catch {
      return 0
    }
  }

  // 1. 底层数据洗平：提取两大引擎的高亮数据，补全跳回锚点
  const currentBookHighlights = computed(() => {
    if (currentBookType.value === 'epub' || currentBookType.value === 'mobi') {
      return epubHighlights.value.map(h => {
        const rawText = h.text || ''
        return {
          id: h.id,
          text: rawText,
          snippet: rawText.substring(0, 100).replace(/\s+/g, ' ') + (rawText.length > 100 ? '...' : ''), 
          jumpAnchor: h.cfis[0], 
          timestamp: h.timestamp || Date.now(),
          type: h.type || 'highlight',
          chapterTitle: h.chapterTitle,
          chapterOrder: h.chapterOrder
        }
      })
    } 
    else if (currentBookType.value === 'txt') {
      const groups = new Map<string, any>()
      txtHighlights.value.forEach(h => {
        const highlightText = getTxtHighlightText(h)
        if (!groups.has(h.id)) {
          groups.set(h.id, {
            id: h.id,
            text: highlightText,
            jumpAnchor: h.offset, 
            timestamp: h.timestamp || Date.now(),
            type: h.type || 'highlight'
          })
        } else {
          if (groups.get(h.id).text.length < 200) {
            groups.get(h.id).text += highlightText
          }
        }
      })
      return Array.from(groups.values()).map(g => ({
        ...g,
        snippet: g.text.substring(0, 100).replace(/\s+/g, ' ') + (g.text.length > 100 ? '...' : ''),
      }))
    }
    return []
  })

  // 2. 核心分组算法：按照所属【章节】归类
  const groupedHighlights = computed(() => {
    const groups: { title: string; order: number; highlights: any[] }[] = []
    
    currentBookHighlights.value.forEach(hl => {
      let chTitle = '未分类笔记'
      let chapterOrder = Number.MAX_SAFE_INTEGER
      
      if (currentBookType.value === 'txt' && tocList.value.length > 0) {
        for (let i = tocList.value.length - 1; i >= 0; i--) {
          if (tocList.value[i].titleStart !== undefined && hl.jumpAnchor >= tocList.value[i].titleStart!) {
            chTitle = tocList.value[i].title
            chapterOrder = i
            break
          }
        }
      } else if (currentBookType.value === 'mobi') {
        chTitle = hl.chapterTitle || '未分类笔记'
        const matchedIndex = tocList.value.findIndex((item) => item.title === chTitle)
        chapterOrder = matchedIndex >= 0 ? matchedIndex : Number.MAX_SAFE_INTEGER
      } else if (currentBookType.value === 'epub' && epubBook.value) {
        if (hl.chapterTitle && hl.chapterOrder !== undefined) {
          chTitle = hl.chapterTitle
          chapterOrder = hl.chapterOrder
        } else {
          const chapterInfo = getEpubChapterInfo(hl.jumpAnchor)
          chTitle = chapterInfo.title
          chapterOrder = chapterInfo.order
        }
      }

      let group = groups.find(g => g.title === chTitle)
      if (!group) {
        group = { title: chTitle, order: chapterOrder, highlights: [] }
        groups.push(group)
      }
      group.highlights.push(hl)
    })

    groups.forEach(g => g.highlights.sort(compareHighlightsByReadingOrder))
    const direction = highlightChapterSortOrder.value === 'asc' ? 1 : -1
    return groups.sort((a, b) => (a.order - b.order) * direction)
  })

  // 3. 监听菜单打开，自动选中第一个有笔记的章节
  watch(isHighlightMenuOpen, (newVal) => {
    if (newVal && groupedHighlights.value.length > 0) {
      activeHighlightChapter.value = groupedHighlights.value[0].title
    }
  })

  return {
    isTopMenuOpen,
    isHighlightMenuOpen,
    activeHighlightChapter,
    highlightChapterSortOrder,
    sidebarTab,
    txtHighlights,
    epubHighlights,
    hlTrigger,
    isAnnotationPanelOpen,
    isAnnotationInputOpen,
    annotationInputText,
    draftAnnotationData,
    currentViewingNote,
    selectionMenuState,
    currentSelectionRange,
    currentSelectionCfi,
    currentSelectionCfis,
    currentTxtSelection,
    enrichEpubHighlightChapters,
    groupedHighlights
  }
}
