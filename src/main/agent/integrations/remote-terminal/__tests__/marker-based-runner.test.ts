import { describe, expect, it } from 'vitest';
import { InteractionDetector } from '../../../services/interaction-detector';
import { runMarkerBasedCommand, type MarkerStream } from '../marker-based-runner';

class FakeMarkerStream implements MarkerStream {
  readonly writes: string[] = [];
  private readonly listeners = new Set<(chunk: string) => void>();

  write(data: string): void {
    this.writes.push(data);
  }

  subscribe(listener: (chunk: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(chunk: string): void {
    this.listeners.forEach((listener) => listener(chunk));
  }
}

describe('runMarkerBasedCommand', () => {
  it('captures output between markers and surfaces interaction prompts', async () => {
    const stream = new FakeMarkerStream();
    const outputs: string[] = [];
    const interactions: string[] = [];

    const handle = runMarkerBasedCommand({
      commandId: 'command-1',
      wrappedCommand: 'echo test',
      startMarker: '__START__',
      endMarker: '__END__',
      stream,
      interactionDetector: new InteractionDetector(),
      callbacks: {
        onOutput: (chunk) => outputs.push(chunk),
        onInteraction: (request) => interactions.push(request.interactionType),
      },
    });

    expect(stream.writes[0]).toContain('echo test');

    stream.emit('noise before start\n');
    stream.emit('__START__\n');
    stream.emit('Password:\n');
    stream.emit('nginx.service is active (running)\n');
    stream.emit('__END__:0\n');

    const result = await handle.result;
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('Password:');
    expect(result.output).toContain('nginx.service is active (running)');
    expect(outputs.join('')).toContain('nginx.service is active (running)');
    expect(interactions).toContain('password');
  });
});
