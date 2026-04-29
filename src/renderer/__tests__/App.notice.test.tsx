import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { APP_NOTICE_EVENT, type AppNoticeEventDetail } from '../utils/appNotice';

vi.mock('../components/TerminalView', () => ({
  TerminalView: () => null,
}));

import App from '../App';

describe('App notice events', () => {
  it('renders a success notice when an app notice event is dispatched', async () => {
    render(<App />);

    window.dispatchEvent(new CustomEvent<AppNoticeEventDetail>(APP_NOTICE_EVENT, {
      detail: {
        message: 'Image uploaded: /srv/app/copilot-clipboard.png',
        level: 'success',
      },
    }));

    expect(await screen.findByText('Image uploaded: /srv/app/copilot-clipboard.png')).toBeInTheDocument();
    expect(screen.getByTestId('app-notice')).toBeInTheDocument();
  });
});
