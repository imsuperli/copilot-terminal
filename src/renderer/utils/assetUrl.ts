export function resolveRendererAssetUrl(assetPath: string): string {
  const normalizedAssetPath = assetPath.replace(/^\/+/, '');
  return new URL(normalizedAssetPath, window.location.href).toString();
}
