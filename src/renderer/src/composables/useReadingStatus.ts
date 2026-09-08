import { useReader } from './useReader'

interface ReadingStatusOptions {
  getExactOffset: () => number
}

export function useReadingStatus(options: ReadingStatusOptions) {
  const { getExactOffset } = options

  const {
    currentBookType,
    tocList,
    fileSize,
    readingProgressText,
    activeChapterTitle,
    epubBook,
    epubRendition,
    epubCfi,
    currentPdfPage,
    pdfTotalPages
  } = useReader()

  const updateReadingStatus = () => {
    if (tocList.value.length === 0) return

    if (currentBookType.value === 'txt') {
      const exactOffset = getExactOffset()
      const currentProg =
        fileSize.value > 0 ? ((exactOffset / fileSize.value) * 100).toFixed(2) : '0.00'
      readingProgressText.value = `${currentProg}%`

      let currentCh = ''
      for (let i = tocList.value.length - 1; i >= 0; i--) {
        const item = tocList.value[i]
        if (item.titleStart !== undefined && exactOffset + 50 >= item.titleStart) {
          currentCh = item.title
          break
        }
      }
      activeChapterTitle.value = currentCh
    } else if (currentBookType.value === 'epub' && epubCfi.value && epubBook.value) {
      if (epubBook.value.locations.length() > 0) {
        const currentProg = (
          epubBook.value.locations.percentageFromCfi(epubCfi.value) * 100
        ).toFixed(2)
        readingProgressText.value = `${currentProg}%`
      }

      type EpubLocationRendition = { location?: { start?: { href: string } } }
      const currentRendition = epubRendition.value as unknown as EpubLocationRendition

      if (currentRendition?.location?.start?.href) {
        const cleanHref = currentRendition.location.start.href.split('#')[0]
        const matchedItem = tocList.value.find((t) => t.href && t.href.includes(cleanHref))
        if (matchedItem) activeChapterTitle.value = matchedItem.title
      }
    } else if (currentBookType.value === 'pdf') {
      const currentProg =
        pdfTotalPages.value > 0
          ? ((currentPdfPage.value / pdfTotalPages.value) * 100).toFixed(2)
          : '0.00'
      readingProgressText.value = `${currentProg}%`

      if (tocList.value.length > 0) {
        let currentCh = ''
        for (let i = tocList.value.length - 1; i >= 0; i--) {
          const item = tocList.value[i]
          if (item.pageNumber !== undefined && currentPdfPage.value >= item.pageNumber) {
            currentCh = item.title
            break
          }
        }
        if (currentCh) activeChapterTitle.value = currentCh
      }
    }
  }

  return {
    updateReadingStatus
  }
}
