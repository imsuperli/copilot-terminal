import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectronSSHHostKeyPromptService } from '../ssh/SSHHostKeyPromptService';

const { mockShowMessageBox } = vi.hoisted(() => ({
  mockShowMessageBox: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: {
    showMessageBox: mockShowMessageBox,
  },
}));

describe('ElectronSSHHostKeyPromptService', () => {
  beforeEach(() => {
    mockShowMessageBox.mockReset();
  });

  it('persists an unknown fingerprint when the user selects trust and save', async () => {
    mockShowMessageBox.mockResolvedValue({ response: 2 });
    const service = new ElectronSSHHostKeyPromptService();

    const decision = await service.confirm({
      host: '10.0.0.21',
      port: 22,
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:new',
      reason: 'unknown',
    });

    expect(mockShowMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'question',
      message: 'First-time SSH connection to 10.0.0.21:22',
    }));
    expect(decision).toEqual({ trusted: true, persist: true });
  });

  it('allows trusting a mismatched fingerprint only for the current session', async () => {
    mockShowMessageBox.mockResolvedValue({ response: 1 });
    const service = new ElectronSSHHostKeyPromptService();

    const decision = await service.confirm({
      host: '10.0.0.21',
      port: 22,
      algorithm: 'ssh-ed25519',
      fingerprint: 'SHA256:new',
      reason: 'mismatch',
      storedFingerprint: 'SHA256:old',
    });

    expect(mockShowMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      type: 'warning',
      message: 'Host key fingerprint changed for 10.0.0.21:22',
      detail: expect.stringContaining('Stored fingerprint: SHA256:old'),
    }));
    expect(decision).toEqual({ trusted: true, persist: false });
  });
});
