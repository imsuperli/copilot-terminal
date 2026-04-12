import { describe, expect, it } from 'vitest';
import { InteractionDetector } from '../index';

describe('InteractionDetector', () => {
  it('detects password prompts and suppresses duplicate prompts until cleared', () => {
    const detector = new InteractionDetector();

    const first = detector.feed('command-1', 'Password: ');
    expect(first).toMatchObject({
      commandId: 'command-1',
      interactionType: 'password',
      secret: true,
    });

    const duplicate = detector.feed('command-1', 'Password: ');
    expect(duplicate).toBeNull();

    detector.clearPromptCache();
    const next = detector.feed('command-1', '[Y/n]');
    expect(next).toMatchObject({
      commandId: 'command-1',
      interactionType: 'confirm',
    });
  });
});
