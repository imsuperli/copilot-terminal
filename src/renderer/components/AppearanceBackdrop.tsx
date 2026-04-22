import React from 'react';
import type { AppearanceSettings } from '../../shared/types/appearance';
import { getAppearanceBackdropDescriptor } from '../utils/appearance';

interface AppearanceBackdropProps {
  appearance: AppearanceSettings;
}

export const AppearanceBackdrop = React.memo(({ appearance }: AppearanceBackdropProps) => {
  const descriptor = getAppearanceBackdropDescriptor(appearance);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[rgb(var(--background))]"
      style={{ top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="absolute inset-0" style={descriptor.baseStyle} />
      {descriptor.layers.map((layer, index) => (
        <div
          key={`${appearance.skin.presetId}:${appearance.skin.kind}:${index}`}
          className={layer.className}
          style={layer.style}
        />
      ))}
      <div className="absolute inset-0 bg-black" style={descriptor.dimStyle} />
    </div>
  );
});

AppearanceBackdrop.displayName = 'AppearanceBackdrop';
