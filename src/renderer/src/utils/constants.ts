// src/utils/constants.ts
//静态资源

// 默认 TXT 封面
export const defaultTxtCover = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140" viewBox="0 0 100 140"><rect width="100" height="140" rx="6" fill="%23e2e8f0"/><path d="M25 35h50v6H25zm0 20h50v6H25zm0 20h50v6H25zm0 20h30v6H25z" fill="%2394a3b8"/></svg>';

// 字体选项数组
export const fontOptions = [
  { label: '跟随系统默认', value: 'inherit' },
  { label: '现代无衬线 (黑体)', value: 'PingFang SC, "Microsoft YaHei", sans-serif' },
  { label: '经典衬线 (宋体)', value: 'Songti SC, SimSun, serif' },
  { label: '优雅手写 (楷体)', value: 'Kaiti SC, KaiTi, serif' },
  { label: '行云流水 (行楷)', value: 'STXingkai, "Xingkai SC", cursive' },
  { label: '经典英文 (新罗马)', value: '"Times New Roman", Times, serif' }
];

// 分块读取的大小配置
export const CHUNK_SIZE = 65536 * 4;