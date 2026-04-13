import { describe, expect, it } from 'vitest';
import { PluginManifestValidator } from '../PluginManifestValidator';

describe('PluginManifestValidator', () => {
  it('normalizes a valid language server manifest', () => {
    const validator = new PluginManifestValidator();

    const manifest = validator.validate({
      schemaVersion: 1,
      id: ' acme.java-language ',
      name: ' Java Language Support ',
      publisher: ' Acme ',
      version: ' 1.0.0 ',
      categories: ['language', 'language', ''],
      tags: ['java', 'lsp', 'java'],
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'language-server',
          languages: ['java', 'java', ''],
          fileExtensions: ['.java', '.java'],
          projectIndicators: ['pom.xml', 'build.gradle', 'pom.xml'],
          workspaceMode: 'per-root',
          features: {
            definition: true,
            hover: true,
          },
          runtime: {
            type: 'java',
            entry: 'server/jdtls.jar',
            args: ['-data', 'workspace'],
          },
          requirements: [
            {
              type: 'java',
              version: '>=17',
            },
          ],
        },
      ],
      settingsSchema: {
        'java.home': {
          type: 'string',
          title: 'Java 21+ Runtime Home',
          scope: 'global',
          inputKind: 'directory',
        },
        'trace.server': {
          type: 'enum',
          title: 'Trace Level',
          scope: 'workspace',
          defaultValue: 'off',
          options: [
            { label: 'Off', value: 'off' },
            { label: 'Verbose', value: 'verbose' },
          ],
        },
      },
    });

    expect(manifest.id).toBe('acme.java-language');
    expect(manifest.name).toBe('Java Language Support');
    expect(manifest.publisher).toBe('Acme');
    expect(manifest.categories).toEqual(['language']);
    expect(manifest.tags).toEqual(['java', 'lsp']);
    expect(manifest.capabilities[0].languages).toEqual(['java']);
    expect(manifest.capabilities[0].fileExtensions).toEqual(['.java']);
    expect(manifest.capabilities[0].projectIndicators).toEqual(['pom.xml', 'build.gradle']);
    expect(manifest.settingsSchema?.['java.home']?.inputKind).toBe('directory');
    expect(validator.getLanguages(manifest)).toEqual(['java']);
  });

  it('rejects unsupported capability types', () => {
    const validator = new PluginManifestValidator();

    expect(() => validator.validate({
      schemaVersion: 1,
      id: 'acme.invalid',
      name: 'Invalid',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'formatter',
          languages: ['java'],
          runtime: {
            type: 'node',
            entry: 'server.js',
          },
        },
      ],
    })).toThrow('Unsupported plugin capability type');
  });

  it('rejects invalid setting input kinds', () => {
    const validator = new PluginManifestValidator();

    expect(() => validator.validate({
      schemaVersion: 1,
      id: 'acme.invalid-input-kind',
      name: 'Invalid Input Kind',
      publisher: 'Acme',
      version: '1.0.0',
      engines: {
        app: '>=3.0.0',
      },
      capabilities: [
        {
          type: 'language-server',
          languages: ['java'],
          runtime: {
            type: 'java',
            entry: 'server/jdtls.jar',
          },
        },
      ],
      settingsSchema: {
        retries: {
          type: 'number',
          title: 'Retries',
          scope: 'global',
          inputKind: 'directory',
        },
      },
    })).toThrow('Plugin setting schema entry inputKind requires a string type');
  });
});
