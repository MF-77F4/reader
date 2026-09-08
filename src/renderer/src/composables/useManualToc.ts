import { EpubCFI } from 'epubjs'
import { useModal } from './useModal'
import { useReader, type TOCItem } from './useReader'

interface ManualTocState {
  additions: TOCItem[]
  removedKeys: string[]
}

interface ManualTocOptions {
  getExactOffset?: () => number
}

interface ManualTocController {
  addManualTocItem: (item: TOCItem) => void
  applySavedTocAdjustments: () => void
  deleteCurrentTocChapter: () => Promise<void>
  deleteTocChapters: (items: TOCItem[]) => Promise<void>
}

const getEmptyState = (): ManualTocState => ({ additions: [], removedKeys: [] })

export function useManualToc(options: ManualTocOptions = {}): ManualTocController {
  const { getExactOffset } = options
  const { showModal } = useModal()
  const {
    currentBookPath,
    currentBookType,
    tocList,
    activeChapterTitle,
    epubRendition,
    currentPdfPage
  } = useReader()

  const getStorageKey = (): string => `manual_toc_${currentBookPath.value}`

  const getTocItemKey = (item: TOCItem): string => {
    if (item.manualId) return `manual:${item.manualId}`
    if (item.titleStart !== undefined) return `txt:${item.titleStart}:${item.title}`
    if (item.cfi) return `epub-cfi:${item.cfi}`
    if (item.href) return `epub:${item.href}:${item.title}`
    if (item.pdfDest) return `pdf:${JSON.stringify(item.pdfDest)}:${item.title}`
    if (item.pageNumber !== undefined) return `pdf-page:${item.pageNumber}:${item.title}`
    return `title:${item.title}`
  }

  const getNormalizedHref = (href?: string): string => (href || '').split('#')[0]

  const compareCfi = (left?: string, right?: string): number | null => {
    if (!left || !right) return null
    try {
      return new EpubCFI().compare(left, right)
    } catch {
      return null
    }
  }

  const getExistingEpubOrder = (item: TOCItem): number => {
    if (item.tocOrder !== undefined) return item.tocOrder

    const itemHref = getNormalizedHref(item.href)
    const matchingIndex = tocList.value.findIndex(
      (tocItem) => getNormalizedHref(tocItem.href) === itemHref
    )
    if (matchingIndex >= 0) return tocList.value[matchingIndex].tocOrder ?? matchingIndex

    return Number.MAX_SAFE_INTEGER
  }

  const loadManualTocState = (): ManualTocState => {
    if (!currentBookPath.value) return getEmptyState()
    const saved = localStorage.getItem(getStorageKey())
    if (!saved) return getEmptyState()

    try {
      const parsed = JSON.parse(saved) as Partial<ManualTocState>
      return {
        additions: Array.isArray(parsed.additions) ? parsed.additions : [],
        removedKeys: Array.isArray(parsed.removedKeys) ? parsed.removedKeys : []
      }
    } catch {
      return getEmptyState()
    }
  }

  const saveManualTocState = (state: ManualTocState): void => {
    if (!currentBookPath.value) return
    localStorage.setItem(getStorageKey(), JSON.stringify(state))
  }

  const sortTocList = (items: TOCItem[]): TOCItem[] => {
    if (currentBookType.value === 'txt') {
      return [...items].sort((left, right) => (left.titleStart || 0) - (right.titleStart || 0))
    }
    if (currentBookType.value === 'pdf') {
      return [...items].sort(
        (left, right) =>
          (left.pageNumber || Number.MAX_SAFE_INTEGER) -
          (right.pageNumber || Number.MAX_SAFE_INTEGER)
      )
    }
    if (currentBookType.value === 'epub') {
      return [...items].sort((left, right) => {
        const cfiComparison = compareCfi(left.cfi, right.cfi)
        if (cfiComparison !== null && cfiComparison !== 0) return cfiComparison

        const leftOrder = getExistingEpubOrder(left)
        const rightOrder = getExistingEpubOrder(right)
        if (leftOrder !== rightOrder) return leftOrder - rightOrder

        const leftManualOffset = left.manualId ? 0.5 : 0
        const rightManualOffset = right.manualId ? 0.5 : 0
        return leftManualOffset - rightManualOffset
      })
    }
    return items
  }

  const applySavedTocAdjustments = (): void => {
    const state = loadManualTocState()
    const removedKeys = new Set(state.removedKeys)
    const additions = state.additions.filter((item) => !removedKeys.has(getTocItemKey(item)))
    const existingKeys = new Set(tocList.value.map(getTocItemKey))
    const newAdditions = additions.filter((item) => !existingKeys.has(getTocItemKey(item)))

    tocList.value = sortTocList([
      ...tocList.value.filter((item) => !removedKeys.has(getTocItemKey(item))),
      ...newAdditions
    ])
  }

  const addManualTocItem = (item: TOCItem): void => {
    const title = item.title.trim()
    if (!title || !currentBookPath.value) return

    const state = loadManualTocState()
    const now = Date.now()
    const manualItem: TOCItem = {
      ...item,
      title,
      id: item.id || `manual-toc-${now}`,
      manualId: item.manualId || `manual-toc-${now}`,
      tocOrder:
        item.tocOrder ??
        (currentBookType.value === 'epub' ? getExistingEpubOrder(item) + 0.5 : undefined)
    }

    state.additions.push(manualItem)
    saveManualTocState(state)
    tocList.value = sortTocList([...tocList.value, manualItem])
    activeChapterTitle.value = title
  }

  const findCurrentTocItem = (): TOCItem | null => {
    if (tocList.value.length === 0) return null

    if (currentBookType.value === 'txt') {
      const exactOffset = getExactOffset?.() || 0
      let currentItem: TOCItem | null = null
      for (const item of tocList.value) {
        if (item.titleStart !== undefined && item.titleStart <= exactOffset + 50) currentItem = item
      }
      return currentItem
    }

    if (currentBookType.value === 'pdf') {
      let currentItem: TOCItem | null = null
      for (const item of tocList.value) {
        if (item.pageNumber !== undefined && item.pageNumber <= currentPdfPage.value) {
          currentItem = item
        }
      }
      return (
        currentItem || tocList.value.find((item) => item.title === activeChapterTitle.value) || null
      )
    }

    type EpubLocationRendition = { location?: { start?: { href?: string } } }
    const rendition = epubRendition.value as unknown as EpubLocationRendition
    const currentHref = rendition?.location?.start?.href?.split('#')[0]
    return (
      tocList.value.find((item) => item.title === activeChapterTitle.value) ||
      tocList.value.find((item) => currentHref && item.href?.includes(currentHref)) ||
      null
    )
  }

  const deleteTocItems = (items: TOCItem[]): void => {
    const itemKeys = new Set(items.map(getTocItemKey))
    const state = loadManualTocState()

    state.additions = state.additions.filter((addition) => !itemKeys.has(getTocItemKey(addition)))
    items.forEach((item) => {
      const itemKey = getTocItemKey(item)
      if (!item.manualId && !state.removedKeys.includes(itemKey)) state.removedKeys.push(itemKey)
    })
    saveManualTocState(state)

    tocList.value = tocList.value.filter((tocItem) => !itemKeys.has(getTocItemKey(tocItem)))
    if (items.some((item) => item.title === activeChapterTitle.value)) activeChapterTitle.value = ''
  }

  const deleteTocChapters = async (items: TOCItem[]): Promise<void> => {
    if (items.length === 0) {
      await showModal({
        title: '没有可删除的章节',
        message: '请先在目录中选择要删除的章节。',
        type: 'alert'
      })
      return
    }

    const confirmed = await showModal({
      title: '删除目录章节',
      message:
        items.length === 1
          ? `确认从目录中删除“${items[0].title}”吗？正文内容不会受到影响。`
          : `确认从目录中删除选中的 ${items.length} 个章节吗？正文内容不会受到影响。`,
      confirmText: '删除',
      cancelText: '取消',
      isDestructive: true
    })
    if (!confirmed) return

    deleteTocItems(items)
  }

  const deleteCurrentTocChapter = async (): Promise<void> => {
    const item = findCurrentTocItem()
    if (!item) {
      await showModal({
        title: '没有可删除的章节',
        message: '当前位置尚未匹配到目录章节。',
        type: 'alert'
      })
      return
    }

    await deleteTocChapters([item])
  }

  return {
    addManualTocItem,
    applySavedTocAdjustments,
    deleteCurrentTocChapter,
    deleteTocChapters
  }
}
