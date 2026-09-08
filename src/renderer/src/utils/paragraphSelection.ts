const PARAGRAPH_CONTAINER_SELECTOR = [
  '.line-item',
  'p',
  'li',
  'blockquote',
  'dd',
  'dt',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div'
].join(',')

interface BoundaryPoint {
  node: Text
  offset: number
}

const getTextNodes = (container: Element, doc: Document): Text[] => {
  const nodes: Text[] = []
  const walker = doc.createTreeWalker(container, doc.defaultView?.NodeFilter.SHOW_TEXT ?? 4)

  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text)
  }

  return nodes
}

const getBoundaryPoint = (nodes: Text[], targetOffset: number): BoundaryPoint | null => {
  let consumed = 0

  for (const node of nodes) {
    const nextOffset = consumed + node.data.length
    if (targetOffset <= nextOffset) {
      return { node, offset: Math.max(0, targetOffset - consumed) }
    }
    consumed = nextOffset
  }

  const lastNode = nodes[nodes.length - 1]
  return lastNode ? { node: lastNode, offset: lastNode.data.length } : null
}

export const expandSelectionToParagraph = (
  selection: Selection | null,
  doc: Document,
  target: EventTarget | null
): boolean => {
  if (!selection || selection.rangeCount === 0) return false

  const rawRange = selection.getRangeAt(0)
  const targetElement =
    target instanceof (doc.defaultView?.Element ?? Element)
      ? target
      : rawRange.commonAncestorContainer.parentElement
  const container = targetElement?.closest(PARAGRAPH_CONTAINER_SELECTOR)

  if (!container || !container.contains(rawRange.commonAncestorContainer)) return false

  const nodes = getTextNodes(container, doc)
  if (nodes.length === 0) return false

  const fullText = nodes.map((node) => node.data).join('')
  let paragraphStart = 0
  let paragraphEnd = fullText.length

  while (paragraphStart < paragraphEnd && /\s/.test(fullText[paragraphStart])) {
    paragraphStart++
  }
  while (paragraphEnd > paragraphStart && /\s/.test(fullText[paragraphEnd - 1])) {
    paragraphEnd--
  }

  const start = getBoundaryPoint(nodes, paragraphStart)
  const end = getBoundaryPoint(nodes, paragraphEnd)
  if (!start || !end || paragraphStart >= paragraphEnd) return false

  const paragraphRange = doc.createRange()
  paragraphRange.setStart(start.node, start.offset)
  paragraphRange.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(paragraphRange)
  return true
}
