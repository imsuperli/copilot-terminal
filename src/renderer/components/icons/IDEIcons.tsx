import React, { useEffect, useState } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

/**
 * 动态IDE图标组件
 * 从IDE安装目录加载实际图标
 *
 * 图标缩放策略：
 * - VSCode 图标通常有较多透明边距，需要放大显示
 * - 其他 IDE 图标相对饱满，使用标准尺寸
 */
export const IDEIcon: React.FC<{ icon: string; size?: number; className?: string }> = ({
  icon,
  size = 16,
  className = ''
}) => {
  const [iconSrc, setIconSrc] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // 判断是否是 VSCode 图标（通过路径特征）
  const isVSCodeIcon = icon.toLowerCase().includes('code') || icon.toLowerCase().includes('vscode');

  // VSCode 图标需要额外放大 1.5 倍来补偿透明边距
  const scaleFactor = isVSCodeIcon ? 1.5 : 1.0;
  const displaySize = Math.round(size * scaleFactor);

  useEffect(() => {
    const loadIcon = async () => {
      setLoading(true);
      setIconSrc('');

      if (icon.startsWith('data:')) {
        setIconSrc(icon);
        setLoading(false);
        return;
      }

      // 如果icon是文件路径(包含路径分隔符或扩展名)
      if (icon && (icon.includes('\\') || icon.includes('/') || icon.includes('.'))) {
        try {
          const response = await window.electronAPI.getIDEIcon(icon);
          if (response.success && response.data) {
            setIconSrc(response.data);
          }
        } catch (error) {
          console.error('Failed to load IDE icon:', error);
        }
      }
      setLoading(false);
    };

    loadIcon();
  }, [icon]);

  if (loading) {
    // 加载中显示占位符
    return (
      <div
        className={`bg-zinc-700 rounded animate-pulse ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  if (!iconSrc) {
    // 无图标时显示默认图标
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
      width={displaySize}
      height={displaySize}
      className={className}
      style={{
        objectFit: 'contain',
        // 使用负 margin 让放大的图标居中显示，不超出容器
        marginLeft: isVSCodeIcon ? `-${Math.round((displaySize - size) / 2)}px` : '0',
        marginTop: isVSCodeIcon ? `-${Math.round((displaySize - size) / 2)}px` : '0',
      }}
    />
  );
};
