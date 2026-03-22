import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SSHPortForwardDialog } from '../SSHPortForwardDialog';

describe('SSHPortForwardDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads active session forwards and removes them', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.listSSHSessionPortForwards).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 'forward-1',
          type: 'local',
          host: '127.0.0.1',
          port: 15432,
          targetAddress: '10.0.0.21',
          targetPort: 5432,
          source: 'profile',
        },
      ],
    });

    render(
      <SSHPortForwardDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSessionPortForwards).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
      });
    });

    expect(screen.getByText('127.0.0.1:15432 -> 10.0.0.21:5432')).toBeInTheDocument();
    expect(screen.getByText('来自配置')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /移除/i }));

    await waitFor(() => {
      expect(window.electronAPI.removeSSHSessionPortForward).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        forwardId: 'forward-1',
      });
    });
  });

  it('adds a new session port forward', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.listSSHSessionPortForwards).mockResolvedValueOnce({
      success: true,
      data: [],
    });
    vi.mocked(window.electronAPI.addSSHSessionPortForward).mockResolvedValueOnce({
      success: true,
      data: {
        id: 'forward-2',
        type: 'remote',
        host: '0.0.0.0',
        port: 18080,
        targetAddress: '127.0.0.1',
        targetPort: 8080,
        description: 'Expose web preview',
        source: 'session',
      },
    });

    render(
      <SSHPortForwardDialog
        open={true}
        onOpenChange={() => undefined}
        windowId="win-1"
        paneId="pane-1"
      />,
    );

    await waitFor(() => {
      expect(window.electronAPI.listSSHSessionPortForwards).toHaveBeenCalled();
    });

    await user.selectOptions(screen.getByLabelText('转发类型'), 'remote');
    await user.clear(screen.getByLabelText('监听主机'));
    await user.type(screen.getByLabelText('监听主机'), '0.0.0.0');
    await user.clear(screen.getByLabelText('监听端口'));
    await user.type(screen.getByLabelText('监听端口'), '18080');
    await user.clear(screen.getByLabelText('目标主机'));
    await user.type(screen.getByLabelText('目标主机'), '127.0.0.1');
    await user.clear(screen.getByLabelText('目标端口'));
    await user.type(screen.getByLabelText('目标端口'), '8080');
    await user.type(screen.getByLabelText('描述'), 'Expose web preview');
    await user.click(screen.getByRole('button', { name: '添加端口转发' }));

    await waitFor(() => {
      expect(window.electronAPI.addSSHSessionPortForward).toHaveBeenCalledWith({
        windowId: 'win-1',
        paneId: 'pane-1',
        forward: expect.objectContaining({
          type: 'remote',
          host: '0.0.0.0',
          port: 18080,
          targetAddress: '127.0.0.1',
          targetPort: 8080,
          description: 'Expose web preview',
        }),
      });
    });

    expect(screen.getByText('会话新增')).toBeInTheDocument();
    expect(screen.getByText('0.0.0.0:18080 -> 127.0.0.1:8080')).toBeInTheDocument();
  });
});
