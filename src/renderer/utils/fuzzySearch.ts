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
  const matchedIndices = new Set<number>();
  let queryIndex = 0;

  for (let i = 0; i < text.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      matchedIndices.add(i);
      queryIndex++;
    }
  }

  const result: Array<{ text: string; highlight: boolean }> = [];
  let segmentStart = 0;
  let segmentHighlight = matchedIndices.has(0);

  for (let i = 1; i < text.length; i++) {
    const highlight = matchedIndices.has(i);
    if (highlight !== segmentHighlight) {
      result.push({
        text: text.slice(segmentStart, i),
        highlight: segmentHighlight,
      });
      segmentStart = i;
      segmentHighlight = highlight;
    }
  }

  if (text.length > 0) {
    result.push({
      text: text.slice(segmentStart),
      highlight: segmentHighlight,
    });
  }

  return result;
}
