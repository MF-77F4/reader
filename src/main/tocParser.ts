import { createReadStream, promises as fs } from 'node:fs'
import iconv from 'iconv-lite'
import jschardet from 'jschardet'

export interface TocItem {
  title: string
  titleStart: number
  titleEnd: number
}

export interface TocParseResult {
  success: boolean
  encoding?: string
  toc?: TocItem[]
  error?: string
}

const numberMap: Record<string, string> = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
  '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
  '⑪': '11', '⑫': '12', '⑬': '13', '⑭': '14', '⑮': '15',
  '⑯': '16', '⑰': '17', '⑱': '18', '⑲': '19', '⑳': '20',
  'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
  'Ⅵ': '6', 'Ⅶ': '7', 'Ⅷ': '8', 'Ⅸ': '9', 'Ⅹ': '10',
  一: '1', 二: '2', 三: '3', 四: '4', 五: '5',
  六: '6', 七: '7', 八: '8', 九: '9', 十: '10'
}

const badLinePattern = /^(?:插图\s*[pPＰｐ]\s*\d+\s*$|[（(【[]\s*(?:译注|注|注释|说明|备注|校注|编注|校对|录入|扫图)|(?:译注|注释|说明|备注|校注|编注|校对|录入|扫图)\s*[:：]|后记执笔中\s*[BbＢｂ][GgＧｇ][MmＭｍ]|参考文献\s*[:：]?|本文(?:由|来自)|转自\s*[:：]?|转载\s*[:：]?|来源\s*[:：]?|翻译\s*[:：]?|图源\s*[:：]?|修图\s*[:：]?|轻之国度|LK\s*[-_ ]?ID|(?:&#8226;|•|·)?\s*各章节标题\s*$|(?:第[零〇一二三四五六七八九十百千万两\d]+卷\s*)?行间|[~～〜]\s*第[零〇一二三四五六七八九十百千万两\d]+\s*幕\s*[~～〜]\s*$|(?:序章|终章|第[零〇一二三四五六七八九十百千万两\d]+章)\s*[:：])/i
const badContentPattern = /(?:这句台词|这部分的剧情|责任编辑|我先声明|只是开个小玩笑|决定推出漫画版|保留到现在才用|可以连着.*一块看)/
const repeatedNoisePattern = /^(?:[哦啊哈嗯呃唔哼…⋯.!！?？—\-_=~～〜·•]|&#\d+;|\s){24,}$/i
const repeatedRunPattern = /(.)\1{20,}/
const repeatedEntityPattern = /(?:&#\d+;){12,}/i

const chapterNumber = '[零〇一二三四五六七八九十百千万两\\d]+'
const volumeNumber = `${chapterNumber}(?:[.．]\\d+)?`
const chapterPattern = new RegExp(
  `^(?:第?${chapterNumber}(?:章|话|节)|序章|终章|间章|幕间|番外|后记|插图)`
)
const volumePattern = new RegExp(
  `^第${volumeNumber}卷(?:\\s+|[-—–_A-Za-z0-9\\u4e00-\\u9fff①-⑳])`
)
const extraTitlePattern = /^(?:短篇(?:集)?|新作短篇|杂志短篇|学园祭IF线|生贺短篇|特典(?:小册子|短篇)?|幕间\d+|○间章|DB特典|结\d+\s+.*(?:Prelude|Interlude|后记))/

function sanitizeEncoding(detectedEncoding: string | null | undefined): string {
  if (!detectedEncoding) return 'utf-8'
  const encoding = detectedEncoding.toUpperCase()
  if (encoding === 'UTF-8-SIG' || encoding === 'ASCII') return 'utf-8'
  if (encoding === 'GB2312' || encoding === 'GBK' || encoding === 'CP936') return 'gb18030'
  if (encoding.includes('UTF-32')) return 'utf-8'
  return encoding.toLowerCase()
}

function normalizeNumbers(text: string): string {
  return [...text].map((character) => numberMap[character] ?? character).join('')
}

function isNoiseLine(text: string): boolean {
  const strippedText = text.trim()
  return (
    strippedText.length > 180 ||
    badLinePattern.test(strippedText) ||
    badContentPattern.test(strippedText) ||
    repeatedNoisePattern.test(strippedText) ||
    repeatedRunPattern.test(strippedText) ||
    repeatedEntityPattern.test(strippedText)
  )
}

function matchesTitleRule(text: string): boolean {
  return chapterPattern.test(text) || volumePattern.test(text) || extraTitlePattern.test(text)
}

function isTitle(text: string): boolean {
  const strippedText = text.trim()
  if (!strippedText || isNoiseLine(strippedText)) return false
  if (matchesTitleRule(strippedText)) return true

  const normalizedText = normalizeNumbers(strippedText)
  return !isNoiseLine(normalizedText) && matchesTitleRule(normalizedText)
}

async function detectFileEncoding(filePath: string): Promise<string> {
  const fileHandle = await fs.open(filePath, 'r')
  try {
    const sample = Buffer.alloc(10_000)
    const { bytesRead } = await fileHandle.read(sample, 0, sample.length, 0)
    return sanitizeEncoding(jschardet.detect(sample.subarray(0, bytesRead)).encoding)
  } finally {
    await fileHandle.close()
  }
}

export async function generateToc(filePath: string): Promise<TocParseResult> {
  try {
    const encoding = await detectFileEncoding(filePath)
    const toc: TocItem[] = []
    let pending = Buffer.alloc(0)
    let pendingOffset = 0

    const processLine = (line: Buffer, start: number, end: number): void => {
      const title = iconv.decode(line, encoding).trim()
      if (isTitle(title)) toc.push({ title, titleStart: start, titleEnd: end })
    }

    for await (const chunk of createReadStream(filePath)) {
      const buffer = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk
      let lineStart = 0

      for (let index = 0; index < buffer.length; index++) {
        if (buffer[index] !== 0x0a) continue
        processLine(buffer.subarray(lineStart, index + 1), pendingOffset + lineStart, pendingOffset + index + 1)
        lineStart = index + 1
      }

      pending = buffer.subarray(lineStart)
      pendingOffset += lineStart
    }

    if (pending.length > 0) processLine(pending, pendingOffset, pendingOffset + pending.length)
    return { success: true, encoding, toc }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}
