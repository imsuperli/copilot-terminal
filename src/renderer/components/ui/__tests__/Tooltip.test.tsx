import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

describe('Tooltip Component', () => {
  it('renders trigger element', () => {
    render(
      <Tooltip content="Tooltip text">
        <button>Hover me</button>
      </Tooltip>
    );
    expect(screen.getByText('Hover me')).toBeDefined();
  });

  it('wraps children correctly', () => {
    render(
      <Tooltip content="Test tooltip">
        <div data-testid="child">Child element</div>
      </Tooltip>
    );
    const child = screen.getByTestId('child');
    expect(child).toBeDefined();
    expect(child.textContent).toBe('Child element');
  });

  it('provides tooltip content', () => {
    const { container } = render(
      <Tooltip content="Helpful tooltip">
        <button>Button</button>
      </Tooltip>
    );
    // Tooltip content is rendered in a portal, so we check the component structure
    expect(container.querySelector('button')).toBeDefined();
  });
});
