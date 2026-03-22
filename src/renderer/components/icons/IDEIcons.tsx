import React, { useEffect, useState, useRef } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * 自动裁剪图片透明边距，返回裁剪后的 data URL。
 * 解决不同 IDE 图标自带 padding 差异导致视觉大小不一致的问题。
 */
function trimTransparentPixels(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      // 找到非透明像素的边界
      let top = height, bottom = 0, left = width, right = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const alpha = data[(y * width + x) * 4 + 3];
          if (alpha > 10) { // 阈值 10，忽略几乎透明的像素
            if (y < top) top = y;
            if (y > bottom) bottom = y;
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }

      // 如果整张图都是透明的，或者裁剪区域太小，返回原图
      if (top > bottom || left > right) {
        resolve(dataUrl);
        return;
      }

      const trimW = right - left + 1;
      const trimH = bottom - top + 1;

      // 如果裁掉的边距不到 5%，说明图标本身就是饱满的，不需要裁剪
      if (trimW > width * 0.95 && trimH > height * 0.95) {
        resolve(dataUrl);
        return;
      }

      // 裁剪并居中到正方形 canvas
      const maxDim = Math.max(trimW, trimH);
      const outCanvas = document.createElement('canvas');
      outCanvas.width = maxDim;
      outCanvas.height = maxDim;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) {
        resolve(dataUrl);
        return;
      }

      const offsetX = Math.round((maxDim - trimW) / 2);
      const offsetY = Math.round((maxDim - trimH) / 2);
      outCtx.drawImage(canvas, left, top, trimW, trimH, offsetX, offsetY, trimW, trimH);

      resolve(outCanvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * 动态IDE图标组件
 * 从IDE安装目录加载实际图标，自动裁剪透明边距确保视觉大小一致。
 */
export const IDEIcon: React.FC<{ icon: string; size?: number; className?: string }> = ({
  icon,
  size = 16,
  className = ''
}) => {
  const [iconSrc, setIconSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadIcon = async () => {
      setLoading(true);
      setIconSrc('');

      let rawSrc = '';

      if (icon.startsWith('data:')) {
        rawSrc = icon;
      } else if (icon && (icon.includes('\\') || icon.includes('/') || icon.includes('.'))) {
        try {
          const response = await window.electronAPI.getIDEIcon(icon);
          if (response.success && response.data) {
            rawSrc = response.data;
          }
        } catch (error) {
          console.error('Failed to load IDE icon:', error);
        }
      }

      if (rawSrc) {
        // 自动裁剪透明边距
        const trimmed = await trimTransparentPixels(rawSrc);
        setIconSrc(trimmed);
      }
      setLoading(false);
    };

    loadIcon();
  }, [icon]);

  if (loading) {
    return (
      <div
        className={`bg-zinc-700 rounded animate-pulse ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (!iconSrc) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <rect x="2" y="2" width="20" height="20" rx="2" fill="currentColor" opacity="0.2" />
        <path
          d="M6 6H8V8H6V6ZM6 10H8V12H6V10ZM6 14H8V16H6V14ZM10 6H18V8H10V6ZM10 10H16V12H10V10ZM10 14H14V16H10V14Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <img
      src={iconSrc}
      alt="IDE Icon"
      width={size}
      height={size}
      className={className}
      style={{
        objectFit: 'contain',
        flexShrink: 0,
      }}
    />
  );
};
