import type { CSSProperties } from 'react';
import type { Settings } from '../../shared/types/workspace';
import type { AppearanceSettings, AppearanceThemeId } from '../../shared/types/appearance';
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

interface AppearanceThemeDefinition {
  app: Record<string, string>;
  terminal: Record<string, string>;
}

const APPEARANCE_THEME_DEFINITIONS: Record<AppearanceThemeId, AppearanceThemeDefinition> = {
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
  const theme = APPEARANCE_THEME_DEFINITIONS[appearance.themeId] ?? APPEARANCE_THEME_DEFINITIONS.obsidian;

  rootStyle.setProperty('--background', theme.app.background);
  rootStyle.setProperty('--foreground', theme.app.foreground);
  rootStyle.setProperty('--card', theme.app.card);
  rootStyle.setProperty('--card-foreground', theme.app.foreground);
  rootStyle.setProperty('--secondary', theme.app.secondary);
  rootStyle.setProperty('--secondary-foreground', theme.app.foreground);
  rootStyle.setProperty('--muted', theme.app.muted);
  rootStyle.setProperty('--muted-foreground', theme.app.mutedForeground);
  rootStyle.setProperty('--accent', theme.app.accent);
  rootStyle.setProperty('--accent-foreground', theme.app.foreground);
  rootStyle.setProperty('--border', theme.app.border);
  rootStyle.setProperty('--input', theme.app.border);
  rootStyle.setProperty('--ring', theme.app.primary);
  rootStyle.setProperty('--primary', theme.app.primary);
  rootStyle.setProperty('--primary-foreground', theme.app.primaryForeground);
  rootStyle.setProperty('--sidebar', theme.app.sidebar);
  rootStyle.setProperty('--sidebar-foreground', theme.app.foreground);
  rootStyle.setProperty('--titlebar', theme.app.titlebar);
  rootStyle.setProperty('--titlebar-foreground', theme.app.titlebarForeground);
  rootStyle.setProperty('--titlebar-border', theme.app.border);
  rootStyle.setProperty('--titlebar-hover', theme.app.accent);

  Object.entries(TERMINAL_TOKEN_MAP).forEach(([key, token]) => {
    rootStyle.setProperty(token, theme.terminal[key]);
  });

  rootStyle.setProperty('--appearance-terminal-opacity', String(appearance.terminalOpacity));
  rootStyle.setProperty('--appearance-terminal-opacity-percent', `${Math.round(appearance.terminalOpacity * 100)}%`);
  rootStyle.setProperty(
    '--terminal-background-effective',
    `color-mix(in srgb, var(--terminal-background) var(--appearance-terminal-opacity-percent, 88%), transparent)`,
  );
  rootStyle.setProperty('--appearance-skin-dim', String(resolveSkinDim(appearance)));
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

function getBackdropBaseStyle(appearance: AppearanceSettings): CSSProperties {
  if (appearance.skin.kind === 'none') {
    return {
      background: `rgb(var(--background))`,
    };
  }

  if (appearance.skin.kind === 'image' && appearance.skin.imagePath) {
    return {
      backgroundImage: `url("${escapeCssUrl(appearance.skin.imagePath)}")`,
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

  if (appearance.skin.kind === 'image' && appearance.skin.imagePath) {
    return [
      {
        className: 'absolute inset-[-8%] will-change-transform',
        style: {
          backgroundImage: 'radial-gradient(circle at 20% 16%, rgba(255,255,255,0.10), transparent 22%), radial-gradient(circle at 78% 18%, rgba(255,255,255,0.08), transparent 24%)',
          opacity: 'var(--appearance-skin-motion-opacity, 0)',
          animation: appearance.reduceMotion || appearance.skin.motion === 'none'
            ? undefined
            : 'appearance-skin-drift var(--appearance-skin-motion-duration, 18s) ease-in-out infinite alternate',
          mixBlendMode: 'screen',
        },
      },
    ];
  }

  const presetId = appearance.skin.presetId;
  if (presetId === 'aurora') {
    return [
      {
        className: 'absolute inset-[-10%] will-change-transform',
        style: {
          background: 'radial-gradient(circle at 18% 18%, rgba(94, 234, 212, 0.24), transparent 28%), radial-gradient(circle at 78% 16%, rgba(113, 183, 255, 0.18), transparent 30%)',
          opacity: 'var(--appearance-skin-motion-opacity, 0)',
          animation: appearance.reduceMotion || appearance.skin.motion === 'none'
            ? undefined
            : 'appearance-skin-drift var(--appearance-skin-motion-duration, 18s) ease-in-out infinite alternate',
          mixBlendMode: 'screen',
        },
      },
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
      {
        className: 'absolute inset-[-6%] will-change-transform',
        style: {
          background: 'radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.28), transparent 20%), radial-gradient(circle at 84% 14%, rgba(184, 137, 71, 0.14), transparent 26%)',
          opacity: 'var(--appearance-skin-motion-opacity, 0)',
          animation: appearance.reduceMotion || appearance.skin.motion === 'none'
            ? undefined
            : 'appearance-skin-float calc(var(--appearance-skin-motion-duration, 18s) * 0.82) ease-in-out infinite alternate',
          mixBlendMode: 'soft-light',
        },
      },
    ];
  }

  return [
    {
      className: 'absolute inset-[-8%] will-change-transform',
      style: {
        background: 'radial-gradient(circle at 18% 18%, rgba(86, 130, 255, 0.18), transparent 28%), radial-gradient(circle at 82% 18%, rgba(244, 158, 73, 0.12), transparent 26%)',
        opacity: 'var(--appearance-skin-motion-opacity, 0)',
        animation: appearance.reduceMotion || appearance.skin.motion === 'none'
          ? undefined
          : 'appearance-skin-drift var(--appearance-skin-motion-duration, 18s) ease-in-out infinite alternate',
        mixBlendMode: 'screen',
      },
    },
    {
      className: 'absolute inset-0',
      style: {
        background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.36) 100%)',
      },
    },
  ];
}

function resolveSkinDim(appearance: AppearanceSettings): number {
  if (appearance.readabilityMode === 'readability') {
    return Math.min(0.92, appearance.skin.dim + 0.18);
  }

  if (appearance.readabilityMode === 'immersive') {
    return Math.max(0.18, appearance.skin.dim - 0.18);
  }

  return appearance.skin.dim;
}

function escapeCssUrl(value: string): string {
  return value.replace(/\\/g, '/').replace(/"/g, '\\"');
}
