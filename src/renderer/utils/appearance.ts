import type { CSSProperties } from 'react';
import type { Settings } from '../../shared/types/workspace';
import type { AppearanceSettings, AppearanceSkinPresetId } from '../../shared/types/appearance';
import { normalizeImagePath, toAppImageUrl } from '../../shared/utils/appImage';
import { DEFAULT_APPEARANCE_SETTINGS, normalizeAppearanceSettings } from '../../shared/utils/appearance';

interface AppearanceBackdropLayer {
  className: string;
  style?: CSSProperties;
}

interface AppearanceBackdropDescriptor {
  baseStyle: CSSProperties;
  layers: AppearanceBackdropLayer[];
  dimStyle: CSSProperties;
}

interface AppearancePresetDefinition {
  app: Record<string, string>;
  terminal: Record<string, string>;
}

export const appearanceTitlebarSurfaceStyle: CSSProperties = {
  background: 'var(--appearance-titlebar-background)',
  backdropFilter: 'var(--appearance-titlebar-backdrop-filter)',
};

// 皮肤预设定义 - 每个预设包含UI颜色方案和终端颜色
const APPEARANCE_PRESET_DEFINITIONS: Record<AppearanceSkinPresetId, AppearancePresetDefinition> = {
  obsidian: {
    app: {
      background: '7 8 10',
      foreground: '242 242 242',
      card: '18 19 23',
      secondary: '24 25 30',
      muted: '34 35 42',
      mutedForeground: '161 161 170',
      accent: '42 44 52',
      border: '54 56 66',
      primary: '168 170 88',
      primaryForeground: '7 8 10',
      sidebar: '12 13 16',
      titlebar: '46 46 46',
      titlebarForeground: '236 236 236',
    },
    terminal: {
      background: '#08090c',
      foreground: '#d7d7d7',
      cursor: '#f2f2f2',
      cursorAccent: '#08090c',
      selection: 'rgba(215, 215, 215, 0.28)',
      black: '#08090c',
      red: '#ff5f6d',
      green: '#4fd66e',
      yellow: '#e4c85f',
      blue: '#6aa7ff',
      magenta: '#d981ff',
      cyan: '#65d6e8',
      white: '#d7d7d7',
      brightBlack: '#7a7f8c',
      brightRed: '#ff7c87',
      brightGreen: '#72f093',
      brightYellow: '#f4e08b',
      brightBlue: '#8fbeff',
      brightMagenta: '#e7a2ff',
      brightCyan: '#8ceaf4',
      brightWhite: '#ffffff',
    },
  },
  midnight: {
    app: {
      background: '5 7 10',
      foreground: '242 242 242',
      card: '17 19 23',
      secondary: '23 25 31',
      muted: '33 36 43',
      mutedForeground: '161 161 170',
      accent: '41 43 52',
      border: '53 56 67',
      primary: '114 137 218',
      primaryForeground: '5 7 10',
      sidebar: '11 13 17',
      titlebar: '27 30 37',
      titlebarForeground: '236 236 236',
    },
    terminal: {
      background: '#05070a',
      foreground: '#d7d7d7',
      cursor: '#7289da',
      cursorAccent: '#05070a',
      selection: 'rgba(114, 137, 218, 0.28)',
      black: '#05070a',
      red: '#ff6b8b',
      green: '#5ff0a6',
      yellow: '#f4d88a',
      blue: '#7289da',
      magenta: '#d99cff',
      cyan: '#65d6e8',
      white: '#d7d7d7',
      brightBlack: '#7a7f8c',
      brightRed: '#ff8fa7',
      brightGreen: '#86ffc4',
      brightYellow: '#fff09b',
      brightBlue: '#8fa3ff',
      brightMagenta: '#eabaff',
      brightCyan: '#8ceaf4',
      brightWhite: '#ffffff',
    },
  },
  aurora: {
    app: {
      background: '6 15 18',
      foreground: '232 255 250',
      card: '12 28 32',
      secondary: '16 38 42',
      muted: '25 54 58',
      mutedForeground: '151 196 190',
      accent: '28 72 76',
      border: '43 92 96',
      primary: '94 234 212',
      primaryForeground: '4 18 20',
      sidebar: '7 22 25',
      titlebar: '10 34 38',
      titlebarForeground: '226 255 250',
    },
    terminal: {
      background: '#061114',
      foreground: '#d7fff8',
      cursor: '#9ffced',
      cursorAccent: '#061114',
      selection: 'rgba(94, 234, 212, 0.30)',
      black: '#061114',
      red: '#ff6b8b',
      green: '#5ff0a6',
      yellow: '#e9d26a',
      blue: '#71b7ff',
      magenta: '#d99cff',
      cyan: '#5eead4',
      white: '#d7fff8',
      brightBlack: '#6e9292',
      brightRed: '#ff8fa7',
      brightGreen: '#86ffc4',
      brightYellow: '#fff09b',
      brightBlue: '#9ccdff',
      brightMagenta: '#eabaff',
      brightCyan: '#96fff0',
      brightWhite: '#ffffff',
    },
  },
  paper: {
    app: {
      background: '235 229 216',
      foreground: '37 33 28',
      card: '245 240 230',
      secondary: '232 224 211',
      muted: '218 208 193',
      mutedForeground: '94 83 70',
      accent: '211 196 174',
      border: '188 173 150',
      primary: '133 91 43',
      primaryForeground: '252 248 241',
      sidebar: '226 217 202',
      titlebar: '213 200 181',
      titlebarForeground: '37 33 28',
    },
    terminal: {
      background: '#f3eadc',
      foreground: '#2d2923',
      cursor: '#5f3f1e',
      cursorAccent: '#f3eadc',
      selection: 'rgba(133, 91, 43, 0.24)',
      black: '#2d2923',
      red: '#b24535',
      green: '#4f7f3a',
      yellow: '#9c6f20',
      blue: '#3f6f99',
      magenta: '#8a5a8f',
      cyan: '#3f7d75',
      white: '#ded3c3',
      brightBlack: '#776c5f',
      brightRed: '#cf604f',
      brightGreen: '#669a4d',
      brightYellow: '#b9852b',
      brightBlue: '#5a88b5',
      brightMagenta: '#a871ad',
      brightCyan: '#589a90',
      brightWhite: '#fff8ec',
    },
  },
  custom: {
    // custom 使用 obsidian 作为默认颜色方案
    app: {
      background: '7 8 10',
      foreground: '242 242 242',
      card: '18 19 23',
      secondary: '24 25 30',
      muted: '34 35 42',
      mutedForeground: '161 161 170',
      accent: '42 44 52',
      border: '54 56 66',
      primary: '168 170 88',
      primaryForeground: '7 8 10',
      sidebar: '12 13 16',
      titlebar: '28 30 36',
      titlebarForeground: '236 236 236',
    },
    terminal: {
      background: '#08090c',
      foreground: '#d7d7d7',
      cursor: '#f2f2f2',
      cursorAccent: '#08090c',
      selection: 'rgba(215, 215, 215, 0.28)',
      black: '#08090c',
      red: '#ff5f6d',
      green: '#4fd66e',
      yellow: '#e4c85f',
      blue: '#6aa7ff',
      magenta: '#d981ff',
      cyan: '#65d6e8',
      white: '#d7d7d7',
      brightBlack: '#7a7f8c',
      brightRed: '#ff7c87',
      brightGreen: '#72f093',
      brightYellow: '#f4e08b',
      brightBlue: '#8fbeff',
      brightMagenta: '#e7a2ff',
      brightCyan: '#8ceaf4',
      brightWhite: '#ffffff',
    },
  },
};

const TERMINAL_TOKEN_MAP: Record<string, string> = {
  background: '--terminal-background',
  foreground: '--terminal-foreground',
  cursor: '--terminal-cursor',
  cursorAccent: '--terminal-cursor-accent',
  selection: '--terminal-selection',
  black: '--terminal-black',
  red: '--terminal-red',
  green: '--terminal-green',
  yellow: '--terminal-yellow',
  blue: '--terminal-blue',
  magenta: '--terminal-magenta',
  cyan: '--terminal-cyan',
  white: '--terminal-white',
  brightBlack: '--terminal-bright-black',
  brightRed: '--terminal-bright-red',
  brightGreen: '--terminal-bright-green',
  brightYellow: '--terminal-bright-yellow',
  brightBlue: '--terminal-bright-blue',
  brightMagenta: '--terminal-bright-magenta',
  brightCyan: '--terminal-bright-cyan',
  brightWhite: '--terminal-bright-white',
};

export function getAppearanceFromSettings(settings?: Pick<Settings, 'appearance'> | null): AppearanceSettings {
  return normalizeAppearanceSettings(settings?.appearance ?? DEFAULT_APPEARANCE_SETTINGS);
}

export function applyAppearanceToDocument(appearance: AppearanceSettings): void {
  if (typeof document === 'undefined') {
    return;
  }

  const rootStyle = document.documentElement.style;
  const preset = APPEARANCE_PRESET_DEFINITIONS[appearance.skin.presetId] ?? APPEARANCE_PRESET_DEFINITIONS.midnight;

  rootStyle.setProperty('--background', preset.app.background);
  rootStyle.setProperty('--foreground', preset.app.foreground);
  rootStyle.setProperty('--card', preset.app.card);
  rootStyle.setProperty('--card-foreground', preset.app.foreground);
  rootStyle.setProperty('--secondary', preset.app.secondary);
  rootStyle.setProperty('--secondary-foreground', preset.app.foreground);
  rootStyle.setProperty('--muted', preset.app.muted);
  rootStyle.setProperty('--muted-foreground', preset.app.mutedForeground);
  rootStyle.setProperty('--accent', preset.app.accent);
  rootStyle.setProperty('--accent-foreground', preset.app.foreground);
  rootStyle.setProperty('--border', preset.app.border);
  rootStyle.setProperty('--input', preset.app.border);
  rootStyle.setProperty('--ring', preset.app.primary);
  rootStyle.setProperty('--primary', preset.app.primary);
  rootStyle.setProperty('--primary-foreground', preset.app.primaryForeground);
  rootStyle.setProperty('--sidebar', preset.app.sidebar);
  rootStyle.setProperty('--sidebar-foreground', preset.app.foreground);
  rootStyle.setProperty('--titlebar', preset.app.titlebar);
  rootStyle.setProperty('--titlebar-foreground', preset.app.titlebarForeground);
  rootStyle.setProperty('--titlebar-border', preset.app.border);
  rootStyle.setProperty('--titlebar-hover', preset.app.accent);

  Object.entries(TERMINAL_TOKEN_MAP).forEach(([key, token]) => {
    rootStyle.setProperty(token, preset.terminal[key]);
  });

  // 将终端背景颜色转换为 RGB 值（用于 rgba）
  const terminalBgColor = preset.terminal.background;
  const terminalBgRgb = hexToRgb(terminalBgColor);
  if (terminalBgRgb) {
    rootStyle.setProperty('--terminal-background-rgb', `${terminalBgRgb.r}, ${terminalBgRgb.g}, ${terminalBgRgb.b}`);
  }

  rootStyle.setProperty('--appearance-terminal-opacity', String(appearance.terminalOpacity));
  rootStyle.setProperty('--appearance-terminal-opacity-percent', `${Math.round(appearance.terminalOpacity * 100)}%`);
  rootStyle.setProperty(
    '--terminal-background-effective',
    `rgba(var(--terminal-background-rgb, 12, 12, 12), var(--appearance-terminal-opacity, 0.62))`,
  );
  const skinDim = resolveSkinDim(appearance);
  const titlebarOpacity = resolveTitlebarOpacity(appearance, skinDim);
  const paneOpacity = resolvePaneOpacity(appearance);
  const paneStrongOpacity = resolvePaneStrongOpacity(appearance, paneOpacity);
  const paneChromeOpacity = resolvePaneChromeOpacity(appearance);
  const cardTopOpacity = resolveCardOpacity(appearance);
  const cardBottomOpacity = clampOpacity(cardTopOpacity + 0.12, 0.32, 0.78);
  const cardHoverTopOpacity = clampOpacity(cardTopOpacity + 0.08, 0.28, 0.82);
  const cardHoverBottomOpacity = clampOpacity(cardTopOpacity + 0.18, 0.36, 0.88);
  rootStyle.setProperty('--appearance-titlebar-background', resolveTitlebarBackground(appearance, titlebarOpacity));
  rootStyle.setProperty('--appearance-titlebar-backdrop-filter', resolveTitlebarBackdropFilter(appearance));
  rootStyle.setProperty('--appearance-pane-background', rgbaWithTerminalBackground(paneOpacity));
  rootStyle.setProperty('--appearance-pane-background-strong', rgbaWithTerminalBackground(paneStrongOpacity));
  rootStyle.setProperty('--appearance-pane-chrome-background', rgbaWithTerminalBackground(paneChromeOpacity));
  rootStyle.setProperty('--appearance-card-surface-top', rgbaWithTerminalBackground(cardTopOpacity));
  rootStyle.setProperty('--appearance-card-surface-bottom', rgbaWithTerminalBackground(cardBottomOpacity));
  rootStyle.setProperty('--appearance-card-hover-surface-top', rgbaWithTerminalBackground(cardHoverTopOpacity));
  rootStyle.setProperty('--appearance-card-hover-surface-bottom', rgbaWithTerminalBackground(cardHoverBottomOpacity));
  rootStyle.setProperty('--appearance-skin-dim', String(skinDim));
  rootStyle.setProperty('--appearance-skin-blur', `${appearance.skin.blur}px`);
  rootStyle.setProperty('--appearance-skin-motion-duration', appearance.reduceMotion ? '0s' : '18s');
  rootStyle.setProperty('--appearance-skin-motion-opacity', appearance.reduceMotion || appearance.skin.motion === 'none' ? '0' : '1');
}

export function getAppearanceSkinStyle(appearance: AppearanceSettings): CSSProperties {
  return getAppearanceBackdropDescriptor(appearance).baseStyle;
}

export function getAppearanceBackdropDescriptor(appearance: AppearanceSettings): AppearanceBackdropDescriptor {
  const layers = buildAppearanceBackdropLayers(appearance);
  return {
    baseStyle: getBackdropBaseStyle(appearance),
    layers,
    dimStyle: {
      opacity: `var(--appearance-skin-dim, ${appearance.skin.dim})`,
    },
  };
}

/**
 * 将本地文件路径转换为可在 CSS url() 中使用的稳定 URL。
 * 会把旧版本遗留的 app-image:// / file:// 路径先解码回本地路径，再重新编码。
 */
function toImageUrl(filePath: string): string {
  const normalizedPath = normalizeImagePath(filePath);
  return normalizedPath ? toAppImageUrl(normalizedPath) : filePath;
}

function getBackdropBaseStyle(appearance: AppearanceSettings): CSSProperties {
  if (appearance.skin.kind === 'none') {
    return {
      background: `rgb(var(--background))`,
    };
  }

  if (appearance.skin.kind === 'image' && appearance.skin.imagePath) {
    return {
      backgroundImage: `url("${escapeCssUrl(toImageUrl(appearance.skin.imagePath))}")`,
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundSize: 'cover',
      filter: appearance.skin.blur > 0 ? `blur(${appearance.skin.blur}px) scale(1.02)` : undefined,
    };
  }

  return {
    background: appearance.skin.gradient,
    filter: appearance.skin.blur > 0 ? `blur(${appearance.skin.blur}px) scale(1.02)` : undefined,
  };
}

function buildAppearanceBackdropLayers(appearance: AppearanceSettings): AppearanceBackdropLayer[] {
  if (appearance.skin.kind === 'none') {
    return [];
  }

  const motionEnabled = !appearance.reduceMotion && appearance.skin.motion !== 'none';

  if (appearance.skin.kind === 'image' && appearance.skin.imagePath) {
    if (!motionEnabled) {
      return [];
    }

    return [
      {
        className: 'absolute inset-[-8%] will-change-transform',
        style: {
          backgroundImage: 'radial-gradient(circle at 20% 16%, rgba(255,255,255,0.10), transparent 22%), radial-gradient(circle at 78% 18%, rgba(255,255,255,0.08), transparent 24%)',
          opacity: 'var(--appearance-skin-motion-opacity, 0)',
          animation: 'appearance-skin-drift var(--appearance-skin-motion-duration, 18s) ease-in-out infinite alternate',
          mixBlendMode: 'screen' as const,
        },
      },
    ];
  }

  const presetId = appearance.skin.presetId;
  if (presetId === 'aurora') {
    return [
      ...(motionEnabled
        ? [{
            className: 'absolute inset-[-10%] will-change-transform',
            style: {
              background: 'radial-gradient(circle at 18% 18%, rgba(94, 234, 212, 0.24), transparent 28%), radial-gradient(circle at 78% 16%, rgba(113, 183, 255, 0.18), transparent 30%)',
              opacity: 'var(--appearance-skin-motion-opacity, 0)',
              animation: 'appearance-skin-drift var(--appearance-skin-motion-duration, 18s) ease-in-out infinite alternate',
              mixBlendMode: 'screen' as const,
            },
          }]
        : []),
      {
        className: 'absolute inset-0',
        style: {
          background: 'linear-gradient(180deg, rgba(4, 20, 23, 0.05) 0%, rgba(4, 20, 23, 0.36) 100%)',
        },
      },
    ];
  }

  if (presetId === 'paper') {
    return [
      {
        className: 'absolute inset-0',
        style: {
          backgroundImage: 'linear-gradient(rgba(120, 91, 52, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(120, 91, 52, 0.03) 1px, transparent 1px)',
          backgroundSize: '120px 120px, 120px 120px',
          opacity: 0.58,
        },
      },
      ...(motionEnabled
        ? [{
            className: 'absolute inset-[-6%] will-change-transform',
            style: {
              background: 'radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.28), transparent 20%), radial-gradient(circle at 84% 14%, rgba(184, 137, 71, 0.14), transparent 26%)',
              opacity: 'var(--appearance-skin-motion-opacity, 0)',
              animation: 'appearance-skin-float calc(var(--appearance-skin-motion-duration, 18s) * 0.82) ease-in-out infinite alternate',
              mixBlendMode: 'soft-light' as const,
            },
          }]
        : []),
    ];
  }

  return [
    ...(motionEnabled
      ? [{
          className: 'absolute inset-[-8%] will-change-transform',
          style: {
            background: 'radial-gradient(circle at 18% 18%, rgba(86, 130, 255, 0.18), transparent 28%), radial-gradient(circle at 82% 18%, rgba(244, 158, 73, 0.12), transparent 26%)',
            opacity: 'var(--appearance-skin-motion-opacity, 0)',
            animation: 'appearance-skin-drift var(--appearance-skin-motion-duration, 18s) ease-in-out infinite alternate',
            mixBlendMode: 'screen' as const,
          },
        }]
      : []),
    {
      className: 'absolute inset-0',
      style: {
        background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.36) 100%)',
      },
    },
  ];
}

function resolveSkinDim(appearance: AppearanceSettings): number {
  const isImageSkin = hasImageBackdrop(appearance);
  const baseDim = isImageSkin
    ? clampOpacity(appearance.skin.dim - 0.24, 0.08, 0.68)
    : appearance.skin.dim;

  if (appearance.readabilityMode === 'readability') {
    return clampOpacity(baseDim + (isImageSkin ? 0.08 : 0.18), 0.08, 0.92);
  }

  if (appearance.readabilityMode === 'immersive') {
    return clampOpacity(baseDim - (isImageSkin ? 0.08 : 0.18), 0.04, 0.72);
  }

  return clampOpacity(baseDim, isImageSkin ? 0.08 : 0.18, 0.82);
}

function resolveTitlebarOpacity(appearance: AppearanceSettings, skinDim: number): number {
  if (!hasImageBackdrop(appearance)) {
    return 1;
  }

  let opacity = 0.56 + ((0.68 - skinDim) * 0.18);

  if (appearance.readabilityMode === 'readability') {
    opacity += 0.12;
  } else if (appearance.readabilityMode === 'immersive') {
    opacity -= 0.08;
  }

  return clampOpacity(opacity, 0.46, 0.82);
}

function resolveTitlebarBackground(appearance: AppearanceSettings, opacity: number): string {
  if (!hasImageBackdrop(appearance)) {
    return 'rgb(var(--titlebar))';
  }

  return `rgba(var(--titlebar), ${opacity.toFixed(3)})`;
}

function resolveTitlebarBackdropFilter(appearance: AppearanceSettings): string {
  return hasImageBackdrop(appearance)
    ? 'saturate(140%) blur(12px)'
    : 'none';
}

function resolvePaneOpacity(appearance: AppearanceSettings): number {
  if (hasImageBackdrop(appearance)) {
    if (appearance.readabilityMode === 'readability') {
      return 0.08;
    }

    return 0;
  }

  const baseOpacity = 0.04 + (appearance.terminalOpacity * 0.10);
  if (appearance.readabilityMode === 'readability') {
    return clampOpacity(baseOpacity + 0.08, 0.08, 0.28);
  }

  if (appearance.readabilityMode === 'immersive') {
    return clampOpacity(baseOpacity - 0.04, 0, 0.18);
  }

  return clampOpacity(baseOpacity, 0.02, 0.22);
}

function resolvePaneStrongOpacity(appearance: AppearanceSettings, paneOpacity: number): number {
  if (hasImageBackdrop(appearance)) {
    if (appearance.readabilityMode === 'readability') {
      return 0.08;
    }

    return 0;
  }

  return clampOpacity(paneOpacity + 0.05, 0.08, 0.3);
}

function resolvePaneChromeOpacity(appearance: AppearanceSettings): number {
  const isImageSkin = hasImageBackdrop(appearance);
  const baseOpacity = isImageSkin ? 0.10 : 0.14;
  const scaledOpacity = baseOpacity + ((appearance.terminalOpacity - 0.62) * (isImageSkin ? 0.08 : 0.12));

  if (appearance.readabilityMode === 'readability') {
    return clampOpacity(scaledOpacity + 0.08, isImageSkin ? 0.14 : 0.18, 0.38);
  }

  if (appearance.readabilityMode === 'immersive') {
    return clampOpacity(scaledOpacity - 0.04, isImageSkin ? 0.06 : 0.08, 0.28);
  }

  return clampOpacity(scaledOpacity, isImageSkin ? 0.08 : 0.12, 0.32);
}

function resolveCardOpacity(appearance: AppearanceSettings): number {
  const baseOpacity = 0.1 + (appearance.terminalOpacity * 0.24);
  if (appearance.readabilityMode === 'readability') {
    return clampOpacity(baseOpacity + 0.08, 0.18, 0.72);
  }

  if (appearance.readabilityMode === 'immersive') {
    return clampOpacity(baseOpacity - 0.06, 0.06, 0.52);
  }

  return clampOpacity(baseOpacity, 0.08, 0.64);
}

function clampOpacity(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbaWithTerminalBackground(alpha: number): string {
  return `rgba(var(--terminal-background-rgb, 12, 12, 12), ${alpha.toFixed(3)})`;
}

function hasImageBackdrop(appearance: AppearanceSettings): boolean {
  return appearance.skin.kind === 'image' && Boolean(appearance.skin.imagePath);
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '/').replace(/"/g, '\\"');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}
