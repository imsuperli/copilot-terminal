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
