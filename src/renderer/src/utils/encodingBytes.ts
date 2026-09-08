const utf8Encoder = new TextEncoder()

export const getEncodedByteLength = (text: string, encoding = 'utf-8'): number => {
  const normalizedEncoding = encoding.toLowerCase()

  if (
    normalizedEncoding.includes('gb') ||
    normalizedEncoding.includes('cp936') ||
    normalizedEncoding.includes('big5')
  ) {
    let bytes = 0
    for (const char of text) {
      const codePoint = char.codePointAt(0) || 0
      bytes += codePoint <= 0x7f ? 1 : codePoint > 0xffff ? 4 : 2
    }
    return bytes
  }

  if (normalizedEncoding.includes('utf-16')) {
    return text.length * 2
  }

  return utf8Encoder.encode(text).length
}
