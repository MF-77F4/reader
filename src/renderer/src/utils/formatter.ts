// src/utils/formatter.ts
//存放格式化工具

// 净化书名
export const cleanBookTitle = (fileName: string): string => {
  if (!fileName) return '';
  let title = fileName.replace(/\.(txt|epub|pdf|mobi|azw3)$/i, '');
  title = title.replace(/\s*\(z-library.*?\)/gi, '');
  title = title.replace(/\s*\(1lib.*?\)/gi, '');
  title = title.replace(/\s*z-lib.*?\)/gi, '');
  return title.trim();
};

// 生成极简高级格式占位封面
export const getDynamicCover = (format?: string): string => {
  const f = (format || 'txt').toLowerCase();
  let bgColor = '#f1f5f9';
  let textColor = '#94a3b8';

  if (f === 'txt') { bgColor = '#e0f2fe'; textColor = '#38bdf8'; } 
  else if (f === 'epub') { bgColor = '#f3e8ff'; textColor = '#c084fc'; } 
  else if (f === 'pdf') { bgColor = '#fee2e2'; textColor = '#fb7185'; } 
  else if (f === 'mobi' || f === 'azw3') { bgColor = '#ffedd5'; textColor = '#fb923c'; }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180">
    <rect width="120" height="180" rx="12" fill="${bgColor}"/>
    <text x="50%" y="50%" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="22" font-weight="700" fill="${textColor}" text-anchor="middle" dominant-baseline="middle">${f.toUpperCase()}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

// 格式化文件大小
export const formatSize = (size?: number): string => {
  if (!size) return '未知大小';
  if (size < 1024) return size + ' B';
  if (size < 1048576) return (size / 1024).toFixed(1) + ' KB';
  if (size < 1073741824) return (size / 1048576).toFixed(1) + ' MB';
  return (size / 1073741824).toFixed(2) + ' GB';
};

// 格式化高亮时间
export const formatHlTime = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
};