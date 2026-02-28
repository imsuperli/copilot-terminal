import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

describe('App - Main Window and Basic Layout', () => {
  it('renders main layout with toolbar and content area', () => {
    const { container } = render(<App />);
    const mainLayout = container.querySelector('.h-screen');
    expect(mainLayout).toBeDefined();
    expect(mainLayout?.className).toContain('flex');
    expect(mainLayout?.className).toContain('flex-col');
    expect(mainLayout?.className).toContain('bg-bg-app');
  });

  it('displays application name in toolbar', () => {
    render(<App />);
    expect(screen.getByText('ausome-terminal')).toBeInTheDocument();
  });

  it('displays version number in toolbar', () => {
    render(<App />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('renders empty state with guidance message', () => {
    render(<App />);
    expect(screen.getByText('创建你的第一个任务窗口')).toBeInTheDocument();
  });

  it('renders create window button', () => {
    render(<App />);
    const button = screen.getByRole('button', { name: /新建窗口/i });
    expect(button).toBeInTheDocument();
  });

  it('logs to console when create window button is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'log');
    render(<App />);
    
    const button = screen.getByRole('button', { name: /新建窗口/i });
    button.click();
    
    expect(consoleSpy).toHaveBeenCalledWith('创建新窗口');
    consoleSpy.mockRestore();
  });

  it('applies dark theme background color', () => {
    const { container } = render(<App />);
    const mainLayout = container.querySelector('.bg-bg-app');
    expect(mainLayout).toBeDefined();
  });
});
