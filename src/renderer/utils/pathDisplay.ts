export function getPathLeafLabel(pathValue: string | null | undefined): string {
  if (!pathValue) {
    return '';
  }

  const trimmed = pathValue.trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) {
    return trimmed;
  }

  if (normalized === '/' || normalized === '~') {
    return normalized;
  }

  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function getDecodedPathLeafLabel(pathValue: string | null | undefined): string {
  if (!pathValue) {
    return '';
  }

  const trimmed = pathValue.trim();
  if (!trimmed) {
    return '';
  }

  const normalizedValue = trimmed
    .replace(/\\/g, '/')
    .replace(/^jar:/i, '')
    .replace(/^zip:/i, '');
  const candidate = normalizedValue.includes('!/')
    ? normalizedValue.slice(normalizedValue.lastIndexOf('!/') + 2)
    : normalizedValue;
  const leaf = getPathLeafLabel(candidate) || candidate;

  try {
    return decodeURIComponent(leaf);
  } catch {
    return leaf;
  }
}
