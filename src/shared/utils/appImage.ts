const APP_IMAGE_PROTOCOL_PREFIX = 'app-image://';

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^data:/i.test(value);
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function stripWindowsDriveLeadingSlash(value: string): string {
  return /^\/[A-Za-z]:\//.test(value) ? value.slice(1) : value;
}

function decodeAppImageUrl(value: string): string {
  const rawPath = value.slice(APP_IMAGE_PROTOCOL_PREFIX.length);
  const decodedPath = safeDecodeURIComponent(rawPath).replace(/\\/g, '/');

  if (isWindowsDrivePath(decodedPath)) {
    return decodedPath;
  }

  if (/^[A-Za-z]\//.test(decodedPath)) {
    return `${decodedPath[0]}:/${decodedPath.slice(2)}`;
  }

  return stripWindowsDriveLeadingSlash(decodedPath);
}

function decodeFileUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const decodedPath = safeDecodeURIComponent(parsed.pathname);

    if (parsed.host) {
      return `//${parsed.host}${decodedPath}`;
    }

    return stripWindowsDriveLeadingSlash(decodedPath);
  } catch {
    return value;
  }
}

function encodePathPreservingSlashes(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, '/');
}

export function normalizeImagePath(value?: string | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith(APP_IMAGE_PROTOCOL_PREFIX)) {
    return decodeAppImageUrl(trimmed);
  }

  if (/^file:\/\//i.test(trimmed)) {
    return decodeFileUrl(trimmed);
  }

  return trimmed;
}

export function toAppImageUrl(value: string): string {
  const normalizedValue = normalizeImagePath(value);
  if (!normalizedValue || isRemoteImageUrl(normalizedValue)) {
    return normalizedValue ?? '';
  }

  const slashNormalized = normalizedValue.replace(/\\/g, '/');
  const encodedPath = encodePathPreservingSlashes(slashNormalized);

  return slashNormalized.startsWith('/')
    ? `${APP_IMAGE_PROTOCOL_PREFIX}${encodedPath}`
    : `${APP_IMAGE_PROTOCOL_PREFIX}/${encodedPath}`;
}

export function toFileUrl(value: string): string {
  const normalizedValue = normalizeImagePath(value);
  if (!normalizedValue || isRemoteImageUrl(normalizedValue) || /^file:\/\//i.test(normalizedValue)) {
    return normalizedValue ?? '';
  }

  const slashNormalized = normalizedValue.replace(/\\/g, '/');
  const encodedPath = encodePathPreservingSlashes(slashNormalized);

  if (slashNormalized.startsWith('//')) {
    const withoutLeadingSlashes = slashNormalized.replace(/^\/+/, '');
    const [host, ...pathParts] = withoutLeadingSlashes.split('/');
    const encodedUncPath = pathParts.map((part) => encodeURIComponent(part)).join('/');
    return `file://${host}/${encodedUncPath}`;
  }

  if (slashNormalized.startsWith('/')) {
    return `file://${encodedPath}`;
  }

  if (isWindowsDrivePath(slashNormalized)) {
    return `file:///${encodedPath.replace(/^([A-Za-z])%3A\//, '$1:/')}`;
  }

  return `file:///${encodedPath}`;
}

