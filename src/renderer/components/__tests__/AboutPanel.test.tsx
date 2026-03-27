import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AboutPanel } from '../AboutPanel';

describe('AboutPanel', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('resolves the app logo relative to the current renderer page', () => {
    window.history.replaceState({}, '', '/dist/renderer/index.html');

    render(
      <AboutPanel
        open={true}
        onClose={() => {}}
        appName="Copilot-Terminal"
        version="2.0.0"
      />
    );

    const logo = screen.getByAltText('Copilot-Terminal Logo');
    expect(logo).toHaveAttribute('src', 'http://localhost:3000/dist/renderer/resources/icon.png');
  });
});
