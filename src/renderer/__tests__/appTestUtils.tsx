import { render, waitFor, type RenderResult } from '@testing-library/react';
import { expect } from 'vitest';
import App from '../App';

export async function renderApp(expectedAppName = 'Synapse'): Promise<RenderResult> {
  const view = render(<App />);

  await waitFor(() => {
    expect(window.electronAPI.getAppVersion).toHaveBeenCalled();
    expect(window.electronAPI.getSettings).toHaveBeenCalled();
    expect(window.electronAPI.listSSHProfiles).toHaveBeenCalled();
  });

  await waitFor(() => {
    expect(view.getByText(expectedAppName)).toBeInTheDocument();
  });

  return view;
}

export function setViewport(width: number, height: number) {
  global.innerWidth = width;
  global.innerHeight = height;
  window.dispatchEvent(new Event('resize'));
}
