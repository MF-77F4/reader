import fs from 'fs'
import iconv from 'iconv-lite'

// 简单的行索引缓存结构 (未来可用于跳转行)
interface FileCache {
  chunks: Map<number, string> // offset -> content
  // future: lineOffsets: number[]
}

const fileCacheMap = new Map<string, FileCache>()

/**
 * 读取文件的某一块内容 (按字节偏移量)
 * @param filePath 文件绝对路径
 * @param offset 起始字节位置
 * @param size 读取字节大小
 */
export async function readChunk(
  filePath: string,
  offset: number,
  size: number,
  encoding: string = 'utf-8'
): Promise<{ content: string; bytesRead: number }> {
  let fileHandle: fs.promises.FileHandle | null = null
  try {
    fileHandle = await fs.promises.open(filePath, 'r')
    const buffer = Buffer.alloc(size)
    const { bytesRead } = await fileHandle.read(buffer, 0, size, offset)

    if (bytesRead === 0) {
      return { content: '', bytesRead: 0 }
    }

    let actualBuffer = buffer.subarray(0, bytesRead)
    let rewindBytes = 0

    // 【万能防截断逻辑】
    if (bytesRead === size) {
      // 任何主流单字符最多占 4 字节，所以最多退回 4 次
      for (let i = 0; i < 4; i++) {
        const tempBuffer = actualBuffer.subarray(0, bytesRead - i)
        // 使用指定的编码去尝试解码
        const tempContent = iconv.decode(tempBuffer, encoding)

        // 如果解码结果的最后一位不是乱码占位符 '' (\uFFFD)
        // 说明这刀切得刚刚好！安全！
        if (!tempContent.endsWith('')) {
          rewindBytes = i
          actualBuffer = tempBuffer
          break
        }
      }
    }

    // 最终完美解码
    const content = iconv.decode(actualBuffer, encoding)

    return {
      content,
      bytesRead: bytesRead - rewindBytes // 告诉前端：我退回了几个字节
    }
  } finally {
    if (fileHandle) {
      await fileHandle.close()
    }
  }
}

/**
 * 获取文件的总大小 (用于计算滚动条总高度)
 */
export function getFileSize(filePath: string): number {
  try {
    const stats = fs.statSync(filePath)
    return stats.size
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return 0
  }
}

/**
 * 清除特定文件的缓存 (当文件关闭时调用)
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function clearFileCache(filePath: string) {
  fileCacheMap.delete(filePath)
}
