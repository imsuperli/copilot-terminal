import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SSHProfileDialog } from '../SSHProfileDialog';
import { SSHProfile } from '../../../shared/types/ssh';

function createSavedProfile(overrides: Partial<SSHProfile> = {}): SSHProfile {
  return {
    id: 'ssh-profile-1',
    name: 'Prod Bastion',
    host: '10.0.0.21',
    port: 22,
    user: 'root',
    auth: 'password',
    privateKeys: [],
    keepaliveInterval: 30,
    keepaliveCountMax: 3,
    readyTimeout: null,
    verifyHostKeys: true,
    x11: false,
    skipBanner: false,
    agentForward: false,
    warnOnClose: true,
    reuseSession: true,
    forwardedPorts: [],
    defaultRemoteCwd: '/srv/app',
    tags: ['prod'],
    createdAt: '2026-03-22T10:00:00.000Z',
    updatedAt: '2026-03-22T10:00:00.000Z',
    ...overrides,
  };
}

describe('SSHProfileDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a password-based SSH profile and stores the password securely', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const savedProfile = createSavedProfile();

    vi.mocked(window.electronAPI.createSSHProfile).mockResolvedValueOnce({
      success: true,
      data: savedProfile,
    });
    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValueOnce({
      success: true,
      data: {
        hasPassword: true,
        hasPassphrase: false,
      },
    });

    render(
      <SSHProfileDialog
        open={true}
        onOpenChange={() => undefined}
        onSaved={onSaved}
      />,
    );

    await user.type(screen.getByLabelText('连接名称'), 'Prod Bastion');
    await user.type(screen.getByLabelText('主机地址'), '10.0.0.21');
    await user.clear(screen.getByLabelText('用户名'));
    await user.type(screen.getByLabelText('用户名'), 'root');
    await user.type(screen.getByLabelText('密码 / 交互认证密钥'), 'super-secret');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(window.electronAPI.createSSHProfile).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Prod Bastion',
        host: '10.0.0.21',
        port: 22,
        user: 'root',
        auth: 'password',
      }));
      expect(window.electronAPI.setSSHPassword).toHaveBeenCalledWith(savedProfile.id, 'super-secret');
      expect(onSaved).toHaveBeenCalledWith(savedProfile, {
        hasPassword: true,
        hasPassphrase: false,
      });
    });
  });

  it('allows saving a password-based SSH profile without storing a password upfront', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.createSSHProfile).mockResolvedValueOnce({
      success: true,
      data: createSavedProfile(),
    });
    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValueOnce({
      success: true,
      data: {
        hasPassword: false,
        hasPassphrase: false,
      },
    });

    render(
      <SSHProfileDialog
        open={true}
        onOpenChange={() => undefined}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('连接名称'), 'Prod Bastion');
    await user.type(screen.getByLabelText('主机地址'), '10.0.0.21');
    await user.clear(screen.getByLabelText('用户名'));
    await user.type(screen.getByLabelText('用户名'), 'root');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(window.electronAPI.createSSHProfile).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Prod Bastion',
        host: '10.0.0.21',
        user: 'root',
        auth: 'password',
      }));
    });

    expect(window.electronAPI.setSSHPassword).not.toHaveBeenCalled();
  });

  it('detects local private keys and appends them to the public key list', async () => {
    const user = userEvent.setup();
    vi.mocked(window.electronAPI.detectLocalSSHPrivateKeys).mockResolvedValueOnce({
      success: true,
      data: ['/home/test/.ssh/id_ed25519', '/home/test/.ssh/id_rsa'],
    });

    render(
      <SSHProfileDialog
        open={true}
        onOpenChange={() => undefined}
        onSaved={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('认证方式'), 'publicKey');
    await user.type(screen.getByLabelText('私钥路径'), '/existing/key');
    await user.click(screen.getByRole('button', { name: '自动检测私钥' }));

    expect(window.electronAPI.detectLocalSSHPrivateKeys).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByLabelText('私钥路径')).toHaveValue([
        '/existing/key',
        '/home/test/.ssh/id_ed25519',
        '/home/test/.ssh/id_rsa',
      ].join('\n'));
    });
    expect(screen.getByText('已追加 2 个本机私钥。')).toBeInTheDocument();
  });

  it('saves jump-host routing and configured port forwards', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const savedProfile = createSavedProfile({
      jumpHostProfileId: 'jump-1',
      forwardedPorts: [
        {
          id: 'forward-1',
          type: 'local',
          host: '127.0.0.1',
          port: 8000,
          targetAddress: '127.0.0.1',
          targetPort: 80,
        },
      ],
    });

    vi.mocked(window.electronAPI.createSSHProfile).mockResolvedValueOnce({
      success: true,
      data: savedProfile,
    });
    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValueOnce({
      success: true,
      data: {
        hasPassword: true,
        hasPassphrase: false,
      },
    });

    render(
      <SSHProfileDialog
        open={true}
        onOpenChange={() => undefined}
        profiles={[
          createSavedProfile(),
          createSavedProfile({
            id: 'jump-1',
            name: 'Bastion',
            host: '10.0.0.10',
          }),
        ]}
        onSaved={onSaved}
      />,
    );

    await user.type(screen.getByLabelText('连接名称'), 'Prod via Bastion');
    await user.type(screen.getByLabelText('主机地址'), '10.0.0.21');
    await user.clear(screen.getByLabelText('用户名'));
    await user.type(screen.getByLabelText('用户名'), 'root');
    await user.type(screen.getByLabelText('密码 / 交互认证密钥'), 'super-secret');
    await user.selectOptions(screen.getByLabelText('路由模式'), 'jumpHost');
    await user.selectOptions(screen.getByLabelText('跳板机配置'), 'jump-1');
    await user.click(screen.getByRole('button', { name: '添加端口转发' }));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(window.electronAPI.createSSHProfile).toHaveBeenCalledWith(expect.objectContaining({
        jumpHostProfileId: 'jump-1',
        forwardedPorts: [
          expect.objectContaining({
            type: 'local',
            host: '127.0.0.1',
            port: 8000,
            targetAddress: '127.0.0.1',
            targetPort: 80,
          }),
        ],
      }));
      expect(window.electronAPI.setSSHPassword).toHaveBeenCalledWith(savedProfile.id, 'super-secret');
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('saves ProxyCommand routing details', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.createSSHProfile).mockResolvedValueOnce({
      success: true,
      data: createSavedProfile({
        proxyCommand: 'ssh -W %h:%p bastion',
      }),
    });
    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValueOnce({
      success: true,
      data: {
        hasPassword: true,
        hasPassphrase: false,
      },
    });

    render(
      <SSHProfileDialog
        open={true}
        onOpenChange={() => undefined}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('连接名称'), 'Prod ProxyCommand');
    await user.type(screen.getByLabelText('主机地址'), '10.0.0.31');
    await user.clear(screen.getByLabelText('用户名'));
    await user.type(screen.getByLabelText('用户名'), 'deploy');
    await user.type(screen.getByLabelText('密码 / 交互认证密钥'), 'super-secret');
    await user.selectOptions(screen.getByLabelText('路由模式'), 'proxyCommand');
    await user.type(screen.getByLabelText('ProxyCommand'), 'ssh -W %h:%p bastion');
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(window.electronAPI.createSSHProfile).toHaveBeenCalledWith(expect.objectContaining({
        proxyCommand: 'ssh -W %h:%p bastion',
      }));
    });
  });

  it('saves custom SSH algorithm preferences', async () => {
    const user = userEvent.setup();

    vi.mocked(window.electronAPI.getSSHAlgorithmCatalog).mockResolvedValueOnce({
      success: true,
      data: {
        defaults: {
          kex: ['curve25519-sha256'],
          hostKey: ['ssh-ed25519'],
          cipher: ['aes128-gcm@openssh.com'],
          hmac: ['hmac-sha2-256'],
          compression: ['none'],
        },
        supported: {
          kex: ['curve25519-sha256', 'diffie-hellman-group14-sha256'],
          hostKey: ['ssh-ed25519', 'rsa-sha2-256'],
          cipher: ['aes128-gcm@openssh.com', 'aes256-gcm@openssh.com'],
          hmac: ['hmac-sha2-256', 'hmac-sha2-512'],
          compression: ['none', 'zlib@openssh.com'],
        },
      },
    });
    vi.mocked(window.electronAPI.createSSHProfile).mockResolvedValueOnce({
      success: true,
      data: createSavedProfile({
        algorithms: {
          kex: ['diffie-hellman-group14-sha256'],
          hostKey: ['ssh-ed25519'],
          cipher: ['aes128-gcm@openssh.com'],
          hmac: ['hmac-sha2-256'],
          compression: ['none'],
        },
      }),
    });
    vi.mocked(window.electronAPI.getSSHCredentialState).mockResolvedValueOnce({
      success: true,
      data: {
        hasPassword: true,
        hasPassphrase: false,
      },
    });

    render(
      <SSHProfileDialog
        open={true}
        onOpenChange={() => undefined}
        onSaved={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('连接名称'), 'Legacy SSH');
    await user.type(screen.getByLabelText('主机地址'), '10.0.0.99');
    await user.clear(screen.getByLabelText('用户名'));
    await user.type(screen.getByLabelText('用户名'), 'legacy');
    await user.type(screen.getByLabelText('密码 / 交互认证密钥'), 'super-secret');

    await user.click(screen.getByLabelText('curve25519-sha256'));
    await user.click(screen.getByLabelText('diffie-hellman-group14-sha256'));
    await user.click(screen.getByRole('button', { name: '创建' }));

    await waitFor(() => {
      expect(window.electronAPI.createSSHProfile).toHaveBeenCalledWith(expect.objectContaining({
        algorithms: expect.objectContaining({
          kex: ['diffie-hellman-group14-sha256'],
          hostKey: ['ssh-ed25519'],
          cipher: ['aes128-gcm@openssh.com'],
          hmac: ['hmac-sha2-256'],
          compression: ['none'],
        }),
      }));
    });
  });
});
