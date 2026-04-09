import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViewSwitchError } from '../ViewSwitchError';

describe('ViewSwitchError', () => {
  it('应该渲染错误消息', () => {
    render(<ViewSwitchError message="切换失败" />);

    expect(screen.getByText('切换失败')).toBeInTheDocument();
  });

  it('应该显示错误图标', () => {
    const { container } = render(<ViewSwitchError message="切换失败" />);

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('应该有正确的 role 属性', () => {
    render(<ViewSwitchError message="切换失败" />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
  });

  it('应该有正确的 data-testid', () => {
    render(<ViewSwitchError message="切换失败" />);

    expect(screen.getByTestId('view-switch-error')).toBeInTheDocument();
  });

  it('应该应用正确的样式类', () => {
    const { container } = render(<ViewSwitchError message="切换失败" />);

    const errorDiv = container.querySelector('[data-testid="view-switch-error"]');
    expect(errorDiv).toHaveClass('fixed', 'top-4', 'bg-red-900/90', 'z-[12050]');
  });
});
