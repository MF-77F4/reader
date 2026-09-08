// src/renderer/src/composables/useTxtEngine.ts
import { nextTick } from 'vue'
import { useReader, type LineItem } from './useReader'
import { useAnnotation, type LineSegment } from './useAnnotation'
import { useManualToc } from './useManualToc'
import { getEncodedByteLength } from '../utils/encodingBytes'
import { readerHost } from '../platform/readerHost'

interface TextLinePart {
  text: string
  lineBreak: string
}

const CHUNK_SIZE = 65536 * 4
const PRELOAD_PREVIOUS_SIZE = 65536

const splitContentWithLineBreaks = (content: string): { lines: TextLinePart[]; trailingText: string } => {
  const lines: TextLinePart[] = []
  const lineBreakPattern = /\r\n|\n|\r/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = lineBreakPattern.exec(content)) !== null) {
    lines.push({
      text: content.slice(lastIndex, match.index),
      lineBreak: match[0]
    })
    lastIndex = match.index + match[0].length
  }

  return {
    lines,
    trailingText: content.slice(lastIndex)
  }
}

// 接收来自 App.vue 的回调函数，保持原有业务调度不断层
interface TxtEngineCallbacks {
  autoSaveProgress: () => void
  updateReadingStatus: () => void
  hideToolbarOnScroll: () => void
  openAnnotationPanel: (id: string) => void
}

export function useTxtEngine(callbacks: TxtEngineCallbacks) {
  // 1. 接入统一状态库
  const {
    currentBookType, currentBookPath, currentEncoding,
    tocList, lines, topOffset, bottomOffset,
    isTopReached, isEndReached, isLoading, isParsing, isJumping,
    leftoverText, topLeftoverText, readingMode, currentTxtPageAnchor
  } = useReader()

  const { txtHighlights, hlTrigger, selectionMenuState } = useAnnotation()
  const { applySavedTocAdjustments } = useManualToc()

  // 2. 解构传入的回调函数
  const { autoSaveProgress, updateReadingStatus, hideToolbarOnScroll, openAnnotationPanel } = callbacks
  let scrollFrame: number | null = null
  let pendingScrollContainer: HTMLElement | null = null
  let indexedHighlightTrigger = -1
  let highlightsByLineText = new Map<string, typeof txtHighlights.value>()
  let bottomLeftoverOffset = 0
  let topLeftoverOffset = 0

  // ==========================================================
  // 下方的所有函数 100% 复制自原版，一字未改！
  // ==========================================================

  // ==============================
  //  DOM 视口侦测 + 字符比例精确映射 (仅限 TXT)
  // ==============================
  const getExactOffset = (useScrollPosition = false): number => {
    if (currentBookType.value === 'txt' && readingMode.value === 'page' && !useScrollPosition) {
      return currentTxtPageAnchor.value
    }

    let exactOffset = topOffset.value
    const scroller = document.querySelector('.scroller') as HTMLElement
    if (!scroller) return exactOffset

    const lineElements = Array.from(scroller.querySelectorAll<HTMLElement>('.line-item'))
    const scrollerRect = scroller.getBoundingClientRect()

    for (const el of lineElements) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom > scrollerRect.top) {
        const lineOffset = Number(el.dataset.lineOffset)
        if (Number.isFinite(lineOffset)) exactOffset = lineOffset
        break
      }
    }

    return Math.max(topOffset.value, exactOffset)
  }

  // ==========================================================
  // 👇 向下加载 (推土机模式 - 仅 TXT)
  // ==========================================================
  const loadNextChunk = async (needAlign = false) => {
    if (isEndReached.value || isLoading.value || currentBookType.value === 'epub') return
    isLoading.value = true

    try {
      const result = await readerHost.readChunk({
        filePath: currentBookPath.value,
        offset: bottomOffset.value,
        size: CHUNK_SIZE,
        encoding: currentEncoding.value,
        needAlign 
      })

      if (!result || !result.success) throw new Error(result?.error || '读取失败')
      let { content, bytesRead, realOffset } = result

      // 🌟 修复 1：清洗 UTF-8 字节截断产生的非法字符占位符
      content = content.replace(/\ufffd/g, '')

      if (lines.value.length === 0 && realOffset !== undefined) {
        topOffset.value = realOffset
        bottomOffset.value = realOffset
      }

      if (bytesRead === 0) {
        isEndReached.value = true
        if (leftoverText.value) {
          lines.value.push({ id: `bot-${Date.now()}`, text: leftoverText.value, approxOffset: bottomOffset.value })
          leftoverText.value = ''
        }
        return
      }

      const readStartOffset = realOffset ?? bottomOffset.value
      const hasLeftover = leftoverText.value.length > 0
      const fullContent = leftoverText.value + content
      const contentStartOffset = hasLeftover ? bottomLeftoverOffset : readStartOffset
      
      // 🌟 修复 2：支持所有换行符 (\r\n, \n, \r)，防止超长行卡死主线程
      const { lines: completedLines, trailingText } = splitContentWithLineBreaks(fullContent)

      let currentLineOffset = contentStartOffset
      const newItems = completedLines.map((line, index) => {
        const item = {
          id: `bot-${Date.now()}-${index}`, 
          text: line.text,
          approxOffset: currentLineOffset // 🌟 注入物理坐标证明，防止高亮串台
        }
        currentLineOffset += getEncodedByteLength(line.text + line.lineBreak, currentEncoding.value)
        return item
      })

      if (bytesRead < CHUNK_SIZE - 10) {
        isEndReached.value = true
        if (trailingText) {
          newItems.push({
            id: `bot-${Date.now()}-tail`,
            text: trailingText,
            approxOffset: currentLineOffset
          })
        }
        leftoverText.value = ''
        bottomLeftoverOffset = 0
      } else {
        leftoverText.value = trailingText
        bottomLeftoverOffset = currentLineOffset
      }

      lines.value.push(...newItems)
      bottomOffset.value = readStartOffset + bytesRead
    } finally {
      isLoading.value = false
    }
  }

  // ==========================================================
  // 👆 向上加载 (倒车模式 - 仅 TXT)
  // ==========================================================
  const loadPrevChunk = async (container?: HTMLElement | null, chunkSize = CHUNK_SIZE) => {
    if (
      isTopReached.value ||
      isLoading.value ||
      topOffset.value <= 0 ||
      currentBookType.value === 'epub'
    )
      return
    isLoading.value = true

    const oldScrollHeight = container?.scrollHeight || 0
    const readSize = Math.min(chunkSize, topOffset.value)
    const readOffset = topOffset.value - readSize

    try {
      const result = await readerHost.readChunk({
        filePath: currentBookPath.value,
        offset: readOffset,
        size: readSize,
        encoding: currentEncoding.value,
        needAlign: true
      })

      if (!result || !result.success) return
      const { content, realOffset } = result

      const readStartOffset = realOffset ?? readOffset
      const hasTopLeftover = topLeftoverText.value.length > 0
      const fullContent = content + topLeftoverText.value
      const { lines: splitLines, trailingText } = splitContentWithLineBreaks(fullContent)

      if (readStartOffset === 0) {
        isTopReached.value = true
        topLeftoverText.value = ''
      } else {
        const firstLine = splitLines.shift()
        topLeftoverText.value = firstLine
          ? `${firstLine.text}${firstLine.lineBreak}${trailingText}`
          : trailingText
        topLeftoverOffset = readStartOffset
      }

      let currentLineOffset =
        hasTopLeftover && readStartOffset === 0 ? topLeftoverOffset : readStartOffset
      const newItems = splitLines.map((line, index) => {
        const item = {
          id: `top-${readStartOffset}-${index}`,
          text: line.text,
          approxOffset: currentLineOffset
        }
        currentLineOffset += getEncodedByteLength(line.text + line.lineBreak, currentEncoding.value)
        return item
      })

      lines.value.unshift(...newItems)
      topOffset.value = readStartOffset

      await nextTick()
      if (container) {
        container.scrollTop += container.scrollHeight - oldScrollHeight
      }
    } finally {
      isLoading.value = false
    }
  }

  // ==============================
  //  滚动监听分发器
  // ==============================
  const processScroll = () => {
    scrollFrame = null
    const container = pendingScrollContainer
    pendingScrollContainer = null
    if (!container) return

    const { scrollTop, scrollHeight, clientHeight } = container
    autoSaveProgress()

    if (scrollTop <= 10 && !isTopReached.value) {
      loadPrevChunk(container)
    } else if (scrollTop + clientHeight >= scrollHeight - 300 && !isEndReached.value) {
      loadNextChunk()
    }
    // 更新状态保持目录高亮和进度同步
    updateReadingStatus()
  }

  const onScroll = (event: Event) => {
    selectionMenuState.value.visible = false

    // 只要在跳跃过程中，无视浏览器发出的所有幽灵滚动事件
    if (currentBookType.value === 'epub' || isJumping.value) return

    const container = event.target as HTMLElement
    if (!container) return

    pendingScrollContainer = container
    if (scrollFrame === null) scrollFrame = requestAnimationFrame(processScroll)
  }

  const onWheel = (event: WheelEvent) => {
    hideToolbarOnScroll()
    selectionMenuState.value.visible = false

    // 同上，跳跃期间屏蔽滚轮
    if (currentBookType.value === 'epub' || isJumping.value) return

    const container = event.currentTarget as HTMLElement
    if (!container) return

    if (currentBookType.value === 'txt' && readingMode.value === 'page') {
      event.preventDefault()
      return
    }

    if (event.deltaY < 0 && container.scrollTop <= 0) {
      if (!isTopReached.value && !isLoading.value) {
        loadPrevChunk(container)
      }
    }
  }

  // ==========================================================
  // 🚀 一号引擎：TXT 装载流水线
  // ==========================================================
  const loadTxtBook = async (fullPath: string) => {
    if (currentBookType.value !== 'txt') return

    // 👇 注入记忆系统
    const savedHls = localStorage.getItem(`txt_hl_${fullPath}`)
    if (savedHls) {
      try { txtHighlights.value = JSON.parse(savedHls) } 
      catch(e) { txtHighlights.value = [] }
    } else {
      txtHighlights.value = []
    }
    hlTrigger.value++ 

    isParsing.value = true
    const parseResult = await readerHost.parseTOC(fullPath)
    if (parseResult.success) {
      tocList.value = parseResult.toc || []
      currentEncoding.value = parseResult.encoding || 'utf-8'
    } else {
      tocList.value = []
      currentEncoding.value = 'utf-8'
    }
    applySavedTocAdjustments()
    isParsing.value = false

    const savedOffset = await readerHost.getProgress(fullPath)
    // 🛡️ 明确告诉 TS：只有是 number 才能赋给 offset，否则统统按 0 处理！
    const validOffset = typeof savedOffset === 'number' ? savedOffset : 0

    topOffset.value = validOffset
    bottomOffset.value = validOffset
    currentTxtPageAnchor.value = validOffset
    bottomLeftoverOffset = validOffset
    topLeftoverOffset = validOffset
    isTopReached.value = topOffset.value <= 0

    // 🎯 核心修复：恢复记忆时，坐标极大概率切在半句话中间，必须传 true 让主进程寻找安全的 \n 边界！
    await loadNextChunk(true)

    // 首屏渲染后预取一小块上文，避免用户第一次向上滚动时才同步读取 256 KB。
    await nextTick()
    if (!isTopReached.value) {
      const scroller =
        readingMode.value === 'scroll'
          ? (document.querySelector('.scroller') as HTMLElement | null)
          : null
      void loadPrevChunk(scroller, PRELOAD_PREVIOUS_SIZE)
    }

    // 🌟 魔法指令：等 Vue 把第一批文字渲染到页面上后，再强行触发一次状态更新，确保目录高亮和进度显示都能第一时间同步
    setTimeout(() => {
      updateReadingStatus()
    }, 100)
  }

  // 🌟 覆写：TXT 渲染碎片引擎 (识别并返回 annotate 标签)
  const getLineSegments = (item: LineItem): LineSegment[] => {
    if (indexedHighlightTrigger !== hlTrigger.value) {
      highlightsByLineText = new Map()
      txtHighlights.value.forEach((highlight) => {
        const highlights = highlightsByLineText.get(highlight.lineText)
        if (highlights) highlights.push(highlight)
        else highlightsByLineText.set(highlight.lineText, [highlight])
      })
      indexedHighlightTrigger = hlTrigger.value
    }

    const sourceText = item.sourceText ?? item.text
    const sourceStart = item.sourceStartIndex ?? 0
    const sourceEnd = sourceStart + item.text.length
    const sourceOffset = item.sourceOffset ?? item.approxOffset ?? 0
    const hls = (highlightsByLineText.get(sourceText) || [])
      .filter(
        (highlight) =>
          Math.abs(highlight.offset - sourceOffset) < 150000 &&
          highlight.startIndex < sourceEnd &&
          highlight.endIndex > sourceStart
      )
      .sort((a, b) => a.startIndex - b.startIndex)
      
    if (hls.length === 0) return [{ type: 'text', content: item.text }]

    const segments: LineSegment[] = [] 
    let cursor = sourceStart
    for (const hl of hls) {
      if (hl.startIndex > cursor) {
        segments.push({
          type: 'text',
          content: sourceText.substring(cursor, Math.min(hl.startIndex, sourceEnd))
        })
      }
      if (hl.endIndex > cursor && hl.startIndex < sourceEnd) {
        const start = Math.max(hl.startIndex, cursor, sourceStart)
        const end = Math.min(hl.endIndex, sourceEnd)
        segments.push({
          type: 'mark',
          id: hl.id,
          content: sourceText.substring(start, end),
          markType: hl.type || 'highlight'
        })
        cursor = Math.max(cursor, end)
      }
    }
    if (cursor < sourceEnd) {
      segments.push({ type: 'text', content: sourceText.substring(cursor, sourceEnd) })
    }
    return segments
  }

  // 🌟 覆写：TXT 句子点击响应 (如果是红线，则弹侧边栏)
  const onContentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (currentBookType.value === 'txt' && target && target.classList.contains('highlight-marker')) {
      const hlId = target.getAttribute('data-hl-id')
      if (hlId) {
        const hl = txtHighlights.value.find(h => h.id === hlId)
        if (hl && hl.type === 'annotate') {
          openAnnotationPanel(hlId) // 点批注，展开右侧抽屉
        } else {
          const rect = target.getBoundingClientRect()
          selectionMenuState.value = {
            visible: true, 
            x: rect.left + rect.width / 2, 
            y: Math.max(rect.top - 58, 60),
            anchorTop: rect.top,
            anchorBottom: rect.bottom,
            text: '', 
            isOverlappingMark: true, 
            overlapType: 'highlight', 
            targetCfis: [hlId]
          }
        }
      }
    }
  }

  // 抛出给外部调用的方法
  return {
    getExactOffset,
    loadNextChunk,
    loadPrevChunk,
    onScroll,
    onWheel,
    loadTxtBook,
    getLineSegments,
    onContentClick
  }
}
