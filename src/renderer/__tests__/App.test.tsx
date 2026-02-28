import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import App from '../App';

describe('Design System Integration', () => {
  it('renders App component with design system', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.min-h-screen')).toBeDefined();
  });

  it('displays design system title', () => {
    const { getByText } = render(<App />);
    expect(getByText('ausome-terminal')).toBeDefined();
    expect(getByText('UI 设计系统基础集成')).toBeDefined();
  });

  it('renders button components section', () => {
    const { getByText } = render(<App />);
    expect(getByText('按钮组件')).toBeDefined();
    expect(getByText('Primary Button')).toBeDefined();
    expect(getByText('Secondary Button')).toBeDefined();
    expect(getByText('Ghost Button')).toBeDefined();
  });

  it('renders dialog component section', () => {
    const { getByText } = render(<App />);
    expect(getByText('对话框组件')).toBeDefined();
    expect(getByText('打开对话框')).toBeDefined();
  });

  it('renders tooltip component section', () => {
    const { getByText } = render(<App />);
    expect(getByText('提示组件')).toBeDefined();
    expect(getByText('悬停查看提示')).toBeDefined();
  });

  it('renders status colors section', () => {
    const { getByText } = render(<App />);
    expect(getByText('状态色展示')).toBeDefined();
    expect(getByText('运行中')).toBeDefined();
    expect(getByText('等待')).toBeDefined();
    expect(getByText('完成')).toBeDefined();
    expect(getByText('出错')).toBeDefined();
    expect(getByText('恢复中')).toBeDefined();
  });

  it('applies Tailwind CSS classes', () => {
    const { container } = render(<App />);
    const mainDiv = container.querySelector('.min-h-screen');
    expect(mainDiv?.className).toContain('p-8');
  });
});
