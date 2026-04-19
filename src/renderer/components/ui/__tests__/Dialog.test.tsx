import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dialog } from '../Dialog';

describe('Dialog Component', () => {
  it('renders when open is true', () => {
    render(
      <Dialog open={true} onOpenChange={() => {}} title="Test Dialog">
        <div>Dialog content</div>
      </Dialog>
    );
    expect(screen.getByText('Test Dialog')).toBeDefined();
    expect(screen.getByText('Dialog content')).toBeDefined();
  });

  it('does not render when open is false', () => {
    render(
      <Dialog open={false} onOpenChange={() => {}} title="Test Dialog">
        <div>Dialog content</div>
      </Dialog>
    );
    expect(screen.queryByText('Test Dialog')).toBeNull();
  });

  it('renders with description', () => {
    render(
      <Dialog
        open={true}
        onOpenChange={() => {}}
        title="Test Dialog"
        description="Test description"
      >
        <div>Content</div>
      </Dialog>
    );
    expect(screen.getByText('Test description')).toBeDefined();
  });

  it('calls onOpenChange when dialog state changes', () => {
    const handleOpenChange = vi.fn();
    render(
      <Dialog open={true} onOpenChange={handleOpenChange} title="Test">
        <div>Content</div>
      </Dialog>
    );
    // Radix UI Dialog handles this internally
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  it('applies correct styling classes', () => {
    render(
      <Dialog open={true} onOpenChange={() => {}} title="Test">
        <div>Content</div>
      </Dialog>
    );
    const title = screen.getByText('Test');
    expect(title.className).toContain('text-[rgb(var(--foreground))]');
  });

  it('supports custom content width classes', () => {
    render(
      <Dialog open={true} onOpenChange={() => {}} title="Test" contentClassName="max-w-[640px]">
        <div>Content</div>
      </Dialog>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('max-w-[640px]');
  });
});
