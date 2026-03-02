/**
 * 模糊搜索匹配
 * @param query 搜索关键词
 * @param target 目标字符串
 * @returns 是否匹配
 */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;

  const lowerQuery = query.toLowerCase();
  const lowerTarget = target.toLowerCase();

  let queryIndex = 0;
  for (let i = 0; i < lowerTarget.length && queryIndex < lowerQuery.length; i++) {
    if (lowerTarget[i] === lowerQuery[queryIndex]) {
      queryIndex++;
    }
  }

  return queryIndex === lowerQuery.length;
}

/**
 * 高亮匹配的文本
 * @param text 原始文本
 * @param query 搜索关键词
 * @returns 包含高亮标记的文本片段数组
 */
export function highlightMatches(text: string, query: string): Array<{ text: string; highlight: boolean }> {
  if (!query) return [{ text, highlight: false }];

  const lowerQuery = query.toLowerCase();
  const lowerText = text.toLowerCase();
  const result: Array<{ text: string; highlight: boolean }> = [];

  let lastIndex = 0;
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      // 添加之前的非匹配部分
      if (i > lastIndex) {
        result.push({ text: text.slice(lastIndex, i), highlight: false });
      }
      // 添加匹配的字符
      result.push({ text: text[i], highlight: true });
      lastIndex = i + 1;
      queryIndex++;
    }
  }

  // 添加剩余的非匹配部分
  if (lastIndex < text.length) {
    result.push({ text: text.slice(lastIndex), highlight: false });
  }

  return result;
}
