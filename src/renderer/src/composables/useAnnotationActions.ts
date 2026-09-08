import { getTxtHighlightText, useAnnotation } from './useAnnotation'
import { useReader } from './useReader'
import { useManualToc } from './useManualToc'
import { formatHlTime } from '../utils/formatter'
import { getEncodedByteLength } from '../utils/encodingBytes'

interface AnnotationActionOptions {
  getExactOffset: () => number
  renderEpubHighlight: (id: string, cfis: string[], type?: 'highlight' | 'annotate') => void
  syncEpubHighlightPalette: () => void
  renderMobiHighlight: (
    id: string,
    cfis: string[],
    type?: 'highlight' | 'annotate'
  ) => Promise<void>
  removeMobiHighlight: (cfis: string[]) => Promise<void>
  saveMobiHighlights: () => void
}

export function useAnnotationActions(options: AnnotationActionOptions) {
  const {
    getExactOffset,
    renderEpubHighlight,
    syncEpubHighlightPalette,
    renderMobiHighlight,
    removeMobiHighlight,
    saveMobiHighlights
  } = options

  const {
    currentBookPath,
    currentBookType,
    currentEncoding,
    epubRendition,
    epubCfi,
    mobiView,
    activeChapterTitle
  } = useReader()
  const { addManualTocItem } = useManualToc()

  const {
    isTopMenuOpen,
    isHighlightMenuOpen,
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
    enrichEpubHighlightChapters
  } = useAnnotation()

  const saveTxtHighlights = () => {
    if (currentBookPath.value && currentBookType.value === 'txt') {
      localStorage.setItem(`txt_hl_${currentBookPath.value}`, JSON.stringify(txtHighlights.value))
    }
  }

  const saveEpubHighlights = () => {
    if (currentBookPath.value && currentBookType.value === 'epub') {
      enrichEpubHighlightChapters()
      localStorage.setItem(`epub_hl_${currentBookPath.value}`, JSON.stringify(epubHighlights.value))
    }
  }

  const onRemoveHighlight = () => {
    if (currentBookType.value === 'mobi') {
      selectionMenuState.value.targetCfis.forEach((idToRemove) => {
        const hl = epubHighlights.value.find((h) => h.id === idToRemove)
        if (hl) void removeMobiHighlight(hl.cfis)
        epubHighlights.value = epubHighlights.value.filter((h) => h.id !== idToRemove)
      })
      saveMobiHighlights()
    } else if (currentBookType.value === 'epub' && epubRendition.value) {
      selectionMenuState.value.targetCfis.forEach((idToRemove) => {
        const hl = epubHighlights.value.find((h) => h.id === idToRemove)

        if (hl) hl.cfis.forEach((cfi) => epubRendition.value?.annotations.remove(cfi, 'highlight'))
        epubHighlights.value = epubHighlights.value.filter((h) => h.id !== idToRemove)
      })
      saveEpubHighlights()
      syncEpubHighlightPalette()
    } else if (currentBookType.value === 'txt') {
      selectionMenuState.value.targetCfis.forEach((idToRemove) => {
        txtHighlights.value = txtHighlights.value.filter((h) => h.id !== idToRemove)
      })
      hlTrigger.value++
      saveTxtHighlights()
    }

    selectionMenuState.value.visible = false
    const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
    iframe?.contentWindow?.getSelection()?.removeAllRanges()
    window.getSelection()?.removeAllRanges()
  }

  const onMarkHighlight = () => {
    const now = Date.now()

    if (currentBookType.value === 'mobi' && currentSelectionCfis.value.length > 0) {
      const hlId = `mobi-hl-${now}`
      const cfisToRender = [...currentSelectionCfis.value]
      epubHighlights.value.push({
        id: hlId,
        cfis: cfisToRender,
        text: selectionMenuState.value.text,
        timestamp: now,
        chapterTitle: activeChapterTitle.value
      })
      saveMobiHighlights()
      void renderMobiHighlight(hlId, cfisToRender)
      mobiView.value?.deselect()
    } else if (
      currentBookType.value === 'epub' &&
      epubRendition.value &&
      currentSelectionCfis.value.length > 0
    ) {
      const hlId = `hl-${now}`
      const cfisToRender = [...currentSelectionCfis.value]

      epubHighlights.value.push({
        id: hlId,
        cfis: cfisToRender,
        text: selectionMenuState.value.text,
        timestamp: now
      })
      saveEpubHighlights()
      renderEpubHighlight(hlId, cfisToRender)
      const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
      iframe?.contentWindow?.getSelection()?.removeAllRanges()
    } else if (currentBookType.value === 'txt' && currentTxtSelection.value.length > 0) {
      const hlId = `txt-hl-${now}`
      const currentAnchor = getExactOffset()

      for (const seg of currentTxtSelection.value) {
        txtHighlights.value.push({
          id: hlId,
          lineText: seg.lineText,
          startIndex: seg.startIndex,
          endIndex: seg.endIndex,
          text: seg.lineText.substring(seg.startIndex, seg.endIndex),
          offset: seg.offset ?? currentAnchor,
          timestamp: now
        })
      }
      hlTrigger.value++
      saveTxtHighlights()
    }

    selectionMenuState.value.visible = false
    currentSelectionRange.value = null
    currentSelectionCfi.value = ''
    currentTxtSelection.value = []
    window.getSelection()?.removeAllRanges()
  }

  const onMarkAnnotate = () => {
    const now = Date.now()

    let draftCfis = [...currentSelectionCfis.value]
    let draftTxtSegments = [...currentTxtSelection.value]
    let draftTextSnippet = selectionMenuState.value.text

    if (selectionMenuState.value.isOverlappingMark && selectionMenuState.value.targetCfis.length > 0) {
      const targetId = selectionMenuState.value.targetCfis[0]

      if (currentBookType.value === 'txt' && draftTxtSegments.length === 0) {
        const oldHls = txtHighlights.value.filter((h) => h.id === targetId)
        if (oldHls.length > 0) {
          draftTxtSegments = oldHls.map((h) => ({
            lineText: h.lineText,
            startIndex: h.startIndex,
            endIndex: h.endIndex,
            offset: h.offset
          }))
          draftTextSnippet = oldHls.map(getTxtHighlightText).join('')
        }
      } else if (
        (currentBookType.value === 'epub' || currentBookType.value === 'mobi') &&
        draftCfis.length === 0
      ) {
        const oldHl = epubHighlights.value.find((h) => h.id === targetId)
        if (oldHl) {
          draftCfis = [...oldHl.cfis]
          draftTextSnippet = oldHl.text
        }
      }
    }

    draftAnnotationData.value = {
      id:
        currentBookType.value === 'mobi'
          ? `mobi-hl-${now}`
          : currentBookType.value === 'epub'
            ? `hl-${now}`
            : `txt-hl-${now}`,
      textSnippet: draftTextSnippet,
      timestamp: now,
      cfis: draftCfis,
      txtSegments: draftTxtSegments,
      anchorOffset: currentBookType.value === 'txt' ? getExactOffset() : 0,
      upgradeIds: selectionMenuState.value.isOverlappingMark
        ? [...selectionMenuState.value.targetCfis]
        : []
    }

    annotationInputText.value = ''
    selectionMenuState.value.visible = false
    isAnnotationInputOpen.value = true
  }

  const onMarkAsTitle = (): void => {
    const title = selectionMenuState.value.text.trim()
    if (!title) return

    if (currentBookType.value === 'txt') {
      const firstSegment = currentTxtSelection.value[0]
      const linePrefix = firstSegment?.lineText.slice(0, firstSegment.startIndex) || ''
      addManualTocItem({
        title,
        titleStart:
          firstSegment?.offset !== undefined
            ? firstSegment.offset + getEncodedByteLength(linePrefix, currentEncoding.value)
            : getExactOffset()
      })
    } else if (currentBookType.value === 'epub' || currentBookType.value === 'mobi') {
      type EpubLocationRendition = { location?: { start?: { href?: string } } }
      const rendition = epubRendition.value as unknown as EpubLocationRendition
      addManualTocItem({
        title,
        href: rendition?.location?.start?.href,
        cfi: currentSelectionCfis.value[0] || currentSelectionCfi.value || epubCfi.value
      })
    }

    selectionMenuState.value.visible = false
    currentSelectionRange.value = null
    currentSelectionCfi.value = ''
    currentSelectionCfis.value = []
    currentTxtSelection.value = []
    const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
    iframe?.contentWindow?.getSelection()?.removeAllRanges()
    window.getSelection()?.removeAllRanges()
  }

  const confirmAnnotation = () => {
    if (!draftAnnotationData.value || !annotationInputText.value.trim()) return

    const data = draftAnnotationData.value
    const noteText = annotationInputText.value.trim()

    if (data.isEdit) {
      if (currentBookType.value === 'mobi') {
        const hl = epubHighlights.value.find((h) => h.id === data.id)
        if (hl) {
          hl.note = noteText
          hl.timestamp = Date.now()
        }
        saveMobiHighlights()
      } else if (currentBookType.value === 'epub') {
        const hl = epubHighlights.value.find((h) => h.id === data.id)
        if (hl) {
          hl.note = noteText
          hl.timestamp = Date.now()
        }
        saveEpubHighlights()
      } else if (currentBookType.value === 'txt') {
        const hls = txtHighlights.value.filter((h) => h.id === data.id)
        hls.forEach((h) => {
          h.note = noteText
          h.timestamp = Date.now()
        })
        saveTxtHighlights()
      }

      if (currentViewingNote.value && currentViewingNote.value.id === data.id) {
        currentViewingNote.value.note = noteText
        currentViewingNote.value.time = formatHlTime(Date.now())
      }

      isAnnotationInputOpen.value = false
      isAnnotationPanelOpen.value = true
      draftAnnotationData.value = null
      return
    }

    if (data.upgradeIds && data.upgradeIds.length > 0 && !data.isEdit) {
      if (currentBookType.value === 'mobi') {
        data.upgradeIds.forEach((idToRemove: string) => {
          const hl = epubHighlights.value.find((h) => h.id === idToRemove)
          if (hl) void removeMobiHighlight(hl.cfis)
          epubHighlights.value = epubHighlights.value.filter((h) => h.id !== idToRemove)
        })
      } else if (currentBookType.value === 'epub') {
        data.upgradeIds.forEach((idToRemove: string) => {
          const hl = epubHighlights.value.find((h) => h.id === idToRemove)
          if (hl) hl.cfis.forEach((cfi) => epubRendition.value?.annotations.remove(cfi, 'highlight'))
          epubHighlights.value = epubHighlights.value.filter((h) => h.id !== idToRemove)
        })
        syncEpubHighlightPalette()
      } else if (currentBookType.value === 'txt') {
        data.upgradeIds.forEach((idToRemove: string) => {
          txtHighlights.value = txtHighlights.value.filter((h) => h.id !== idToRemove)
        })
      }
    }

    if (currentBookType.value === 'mobi') {
      epubHighlights.value.push({
        id: data.id,
        cfis: data.cfis,
        text: data.textSnippet,
        timestamp: data.timestamp,
        type: 'annotate',
        note: noteText,
        chapterTitle: activeChapterTitle.value
      })
      saveMobiHighlights()
      void renderMobiHighlight(data.id, data.cfis, 'annotate')
      mobiView.value?.deselect()
    } else if (currentBookType.value === 'epub' && epubRendition.value) {
      epubHighlights.value.push({
        id: data.id,
        cfis: data.cfis,
        text: data.textSnippet,
        timestamp: data.timestamp,
        type: 'annotate',
        note: noteText
      })
      saveEpubHighlights()
      syncEpubHighlightPalette()
      renderEpubHighlight(data.id, data.cfis, 'annotate')
      const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
      iframe?.contentWindow?.getSelection()?.removeAllRanges()
    } else if (currentBookType.value === 'txt') {
      for (const seg of data.txtSegments) {
        txtHighlights.value.push({
          id: data.id,
          lineText: seg.lineText,
          startIndex: seg.startIndex,
          endIndex: seg.endIndex,
          text: seg.lineText.substring(seg.startIndex, seg.endIndex),
          offset: seg.offset ?? data.anchorOffset,
          timestamp: data.timestamp,
          type: 'annotate',
          note: noteText
        })
      }
      hlTrigger.value++
      saveTxtHighlights()
    }

    isAnnotationInputOpen.value = false
    draftAnnotationData.value = null
    currentSelectionRange.value = null
    currentSelectionCfi.value = ''
    currentTxtSelection.value = []
    window.getSelection()?.removeAllRanges()
  }

  const cancelAnnotation = () => {
    isAnnotationInputOpen.value = false

    if (draftAnnotationData.value && draftAnnotationData.value.isEdit) {
      isAnnotationPanelOpen.value = true
    } else {
      window.getSelection()?.removeAllRanges()
      const iframe = document.querySelector('.epub-viewer iframe') as HTMLIFrameElement
      iframe?.contentWindow?.getSelection()?.removeAllRanges()
      mobiView.value?.deselect()
    }

    draftAnnotationData.value = null
  }

  const openAnnotationPanel = (id: string) => {
    const hl =
      currentBookType.value === 'txt'
        ? txtHighlights.value.find((h) => h.id === id)
        : epubHighlights.value.find((h) => h.id === id)

    if (hl && hl.type === 'annotate') {
      let fullText = hl.text
      if (currentBookType.value === 'txt') {
        const pieces = txtHighlights.value
          .filter((h) => h.id === id)
          .sort((a, b) => a.startIndex - b.startIndex)
        fullText = pieces.map(getTxtHighlightText).join('')
      }
      currentViewingNote.value = {
        id: hl.id,
        snippet: fullText,
        note: hl.note || '',
        time: formatHlTime(hl.timestamp)
      }

      isTopMenuOpen.value = false
      isHighlightMenuOpen.value = false
      selectionMenuState.value.visible = false
      isAnnotationPanelOpen.value = true
    }
  }

  const deleteAnnotation = () => {
    if (!currentViewingNote.value) return
    const idToRemove = currentViewingNote.value.id

    if (currentBookType.value === 'mobi') {
      const hl = epubHighlights.value.find((h) => h.id === idToRemove)
      if (hl) void removeMobiHighlight(hl.cfis)
      epubHighlights.value = epubHighlights.value.filter((h) => h.id !== idToRemove)
      saveMobiHighlights()
    } else if (currentBookType.value === 'epub' && epubRendition.value) {
      const hl = epubHighlights.value.find((h) => h.id === idToRemove)
      if (hl) hl.cfis.forEach((cfi) => epubRendition.value?.annotations.remove(cfi, 'highlight'))
      epubHighlights.value = epubHighlights.value.filter((h) => h.id !== idToRemove)
      saveEpubHighlights()
      syncEpubHighlightPalette()
    } else if (currentBookType.value === 'txt') {
      txtHighlights.value = txtHighlights.value.filter((h) => h.id !== idToRemove)
      hlTrigger.value++
      saveTxtHighlights()
    }

    isAnnotationPanelOpen.value = false
    currentViewingNote.value = null
  }

  const editAnnotation = () => {
    if (!currentViewingNote.value) return
    const id = currentViewingNote.value.id
    const hl =
      currentBookType.value === 'txt'
        ? txtHighlights.value.find((h) => h.id === id)
        : epubHighlights.value.find((h) => h.id === id)

    if (hl) {
      draftAnnotationData.value = {
        isEdit: true,
        id: hl.id,
        textSnippet: currentViewingNote.value.snippet
      }
      annotationInputText.value = currentViewingNote.value.note
      isAnnotationPanelOpen.value = false
      isAnnotationInputOpen.value = true
    }
  }

  return {
    saveTxtHighlights,
    saveEpubHighlights,
    onRemoveHighlight,
    onMarkHighlight,
    onMarkAnnotate,
    onMarkAsTitle,
    confirmAnnotation,
    cancelAnnotation,
    openAnnotationPanel,
    deleteAnnotation,
    editAnnotation
  }
}
