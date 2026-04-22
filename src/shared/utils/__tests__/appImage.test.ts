import { describe, expect, it } from 'vitest';
import { normalizeImagePath, toAppImageUrl, toFileUrl } from '../appImage';

describe('app-image utilities', () => {
  it('normalizes legacy app-image windows urls back to local paths', () => {
    expect(normalizeImagePath('app-image://C:/Wallpapers/nebula.png')).toBe('C:/Wallpapers/nebula.png');
    expect(normalizeImagePath('app-image:///C%3A/Wallpapers/nebula%2001.png')).toBe('C:/Wallpapers/nebula 01.png');
  });

  it('normalizes file urls back to local paths', () => {
    expect(normalizeImagePath('file:///tmp/skin%20image.png')).toBe('/tmp/skin image.png');
    expect(normalizeImagePath('file:///C:/Wallpapers/nebula.png')).toBe('C:/Wallpapers/nebula.png');
  });

  it('encodes local paths to stable app-image urls', () => {
    expect(toAppImageUrl('/tmp/skin image#1?.png')).toBe('app-image:///tmp/skin%20image%231%3F.png');
    expect(toAppImageUrl('C:\\Wallpapers\\nebula 01.png')).toBe('app-image:///C%3A/Wallpapers/nebula%2001.png');
  });

  it('encodes local paths to file urls', () => {
    expect(toFileUrl('/tmp/skin image#1?.png')).toBe('file:///tmp/skin%20image%231%3F.png');
    expect(toFileUrl('C:\\Wallpapers\\nebula 01.png')).toBe('file:///C:/Wallpapers/nebula%2001.png');
  });
});
