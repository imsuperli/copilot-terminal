import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppNotice } from '../AppNotice';

describe('AppNotice', () => {
  it('renders the message', () => {
    render(<AppNotice message="Upload complete" />);

    expect(screen.getByText('Upload complete')).toBeInTheDocument();
  });

  it('uses the shared alert role and test id', () => {
    render(<AppNotice message="Upload complete" tone="success" />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('app-notice')).toBeInTheDocument();
  });

  it('applies success styling when tone is success', () => {
    const { container } = render(<AppNotice message="Upload complete" tone="success" />);

    const notice = container.querySelector('[data-testid="app-notice"]');
    expect(notice).toHaveClass('border-emerald-500/30');
  });
});
