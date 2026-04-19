import React from 'react';
import type { AppearanceSettings } from '../../shared/types/appearance';
import { getAppearanceSkinStyle } from '../utils/appearance';

interface AppearanceBackdropProps {
  appearance: AppearanceSettings;
}

export const AppearanceBackdrop = React.memo(({ appearance }: AppearanceBackdropProps) => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[rgb(var(--background))]"
  >
    <div
      className="absolute inset-0"
      style={getAppearanceSkinStyle(appearance)}
    />
    <div
      className="absolute inset-0 bg-black"
      style={{
        opacity: `var(--appearance-skin-dim, ${appearance.skin.dim})`,
      }}
    />
  </div>
));

AppearanceBackdrop.displayName = 'AppearanceBackdrop';
