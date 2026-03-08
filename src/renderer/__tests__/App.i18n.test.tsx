import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../components/TerminalView', () => ({
  TerminalView: () => null,
}));

import App from '../App';

describe('App i18n', () => {
  it('renders English UI when persisted language is en-US', async () => {
    vi.mocked(window.electronAPI.getSettings).mockResolvedValueOnce({
      success: true,
      data: {
        language: 'en-US',
        ides: [],
        quickNav: { items: [] },
      },
    });

    render(<App />);

    expect(await screen.findByText('Welcome to Copilot-Terminal')).toBeInTheDocument();
    expect(screen.getByText('Create your first terminal window to get started')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en-US');
  });
});
