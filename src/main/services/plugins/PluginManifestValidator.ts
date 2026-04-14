import fs from 'fs-extra';
import path from 'path';
import type {
  CodeActionProviderPluginCapability,
  DebugAdapterPluginCapability,
  FormatterPluginCapability,
  LanguageServerPluginCapability,
  LinterPluginCapability,
  PluginCapability,
  PluginCapabilityFeatures,
  PluginManifest,
  PluginRequirement,
  PluginRuntime,
  PluginSettingOption,
  PluginSettingSchemaEntry,
  TestProviderPluginCapability,
} from '../../../shared/types/plugin';
import { normalizeOptionalString, uniqueStrings } from '../ssh/storeUtils';

export class PluginManifestValidator {
  async readFromDirectory(directoryPath: string): Promise<PluginManifest> {
    const manifestPath = path.join(directoryPath, 'plugin.json');
    const payload = await fs.readJson(manifestPath);
    return this.validate(payload);
  }

  validate(value: unknown): PluginManifest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Plugin manifest must be an object');
    }

    const candidate = value as Partial<PluginManifest>;
    const capabilities = Array.isArray(candidate.capabilities)
      ? candidate.capabilities.map((capability, index) => this.normalizeCapability(capability, index))
      : [];

    if (capabilities.length === 0) {
      throw new Error('Plugin manifest must declare at least one capability');
    }

    return {
      schemaVersion: normalizePositiveInteger(candidate.schemaVersion, 'plugin manifest schemaVersion'),
      id: requireNonEmptyString(candidate.id, 'plugin manifest id'),
      name: requireNonEmptyString(candidate.name, 'plugin manifest name'),
      publisher: requireNonEmptyString(candidate.publisher, 'plugin manifest publisher'),
      version: requireNonEmptyString(candidate.version, 'plugin manifest version'),
      ...(normalizeOptionalString(candidate.description) ? { description: normalizeOptionalString(candidate.description) } : {}),
      ...(normalizeOptionalString(candidate.homepage) ? { homepage: normalizeOptionalString(candidate.homepage) } : {}),
      ...(normalizeOptionalString(candidate.license) ? { license: normalizeOptionalString(candidate.license) } : {}),
      ...(Array.isArray(candidate.categories) ? { categories: uniqueStrings(candidate.categories) as PluginManifest['categories'] } : {}),
      ...(Array.isArray(candidate.tags) ? { tags: uniqueStrings(candidate.tags) } : {}),
      engines: {
        app: requireNonEmptyString(candidate.engines?.app, 'plugin manifest engines.app'),
      },
      capabilities,
      ...(candidate.settingsSchema && typeof candidate.settingsSchema === 'object'
        ? {
            settingsSchema: Object.fromEntries(
              Object.entries(candidate.settingsSchema).map(([key, entry]) => [
                requireNonEmptyString(key, 'plugin setting key'),
                this.normalizeSettingSchemaEntry(entry),
              ]),
            ),
          }
        : {}),
    };
  }

  getLanguages(manifest: PluginManifest): string[] {
    return uniqueStrings(manifest.capabilities.flatMap((capability) => capability.languages ?? []))
      .sort((left, right) => left.localeCompare(right));
  }

  private normalizeCapability(value: unknown, index: number): PluginCapability {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Plugin capability at index ${index} must be an object`);
    }

    const candidate = value as Partial<PluginCapability>;
    switch (candidate.type) {
      case 'language-server':
        return {
          type: 'language-server',
          languages: normalizeRequiredStringArray(candidate.languages, `plugin capability[${index}].languages`),
          ...(Array.isArray(candidate.fileExtensions)
            ? { fileExtensions: uniqueStrings(candidate.fileExtensions) }
            : {}),
          ...(Array.isArray(candidate.projectIndicators)
            ? { projectIndicators: uniqueStrings(candidate.projectIndicators) }
            : {}),
          ...(typeof candidate.priority === 'number' ? { priority: candidate.priority } : {}),
          ...(typeof candidate.takesOverBuiltinLanguageService === 'boolean'
            ? { takesOverBuiltinLanguageService: candidate.takesOverBuiltinLanguageService }
            : {}),
          ...(candidate.workspaceMode === 'per-pane' || candidate.workspaceMode === 'per-root'
            ? { workspaceMode: candidate.workspaceMode }
            : {}),
          ...(candidate.features ? { features: this.normalizeCapabilityFeatures(candidate.features) } : {}),
          runtime: this.normalizeRuntime(candidate.runtime, index),
          ...(Array.isArray(candidate.requirements)
            ? { requirements: candidate.requirements.map((requirement, requirementIndex) => this.normalizeRequirement(requirement, index, requirementIndex)) }
            : {}),
        } satisfies LanguageServerPluginCapability;
      case 'formatter':
        return {
          type: 'formatter',
          ...this.normalizeExecutableCapability(candidate, index),
        } satisfies FormatterPluginCapability;
      case 'linter':
        return {
          type: 'linter',
          ...this.normalizeExecutableCapability(candidate, index),
        } satisfies LinterPluginCapability;
      case 'code-action-provider':
        return {
          type: 'code-action-provider',
          ...this.normalizeExecutableCapability(candidate, index),
        } satisfies CodeActionProviderPluginCapability;
      case 'test-provider':
        return {
          type: 'test-provider',
          ...this.normalizeExecutableCapability(candidate, index),
        } satisfies TestProviderPluginCapability;
      case 'debug-adapter':
        return {
          type: 'debug-adapter',
          ...this.normalizeExecutableCapability(candidate, index),
          adapterType: requireNonEmptyString(candidate.adapterType, `plugin capability[${index}].adapterType`),
        } satisfies DebugAdapterPluginCapability;
      default:
        throw new Error(`Unsupported plugin capability type: ${String(candidate.type ?? '')}`);
    }
  }

  private normalizeExecutableCapability(
    candidate: Partial<
      FormatterPluginCapability
      | LinterPluginCapability
      | CodeActionProviderPluginCapability
      | TestProviderPluginCapability
      | DebugAdapterPluginCapability
    >,
    capabilityIndex: number,
  ) {
    return {
      languages: normalizeRequiredStringArray(candidate.languages, `plugin capability[${capabilityIndex}].languages`),
      ...(Array.isArray(candidate.fileExtensions)
        ? { fileExtensions: uniqueStrings(candidate.fileExtensions) }
        : {}),
      ...(typeof candidate.priority === 'number' ? { priority: candidate.priority } : {}),
      runtime: this.normalizeRuntime(candidate.runtime, capabilityIndex),
      ...(Array.isArray(candidate.requirements)
        ? { requirements: candidate.requirements.map((requirement, requirementIndex) => this.normalizeRequirement(requirement, capabilityIndex, requirementIndex)) }
        : {}),
    };
  }

  private normalizeCapabilityFeatures(value: unknown): PluginCapabilityFeatures {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Plugin capability features must be an object');
    }

    const candidate = value as Partial<PluginCapabilityFeatures>;
    return {
      ...(typeof candidate.definition === 'boolean' ? { definition: candidate.definition } : {}),
      ...(typeof candidate.hover === 'boolean' ? { hover: candidate.hover } : {}),
      ...(typeof candidate.references === 'boolean' ? { references: candidate.references } : {}),
      ...(typeof candidate.documentSymbol === 'boolean' ? { documentSymbol: candidate.documentSymbol } : {}),
      ...(typeof candidate.workspaceSymbol === 'boolean' ? { workspaceSymbol: candidate.workspaceSymbol } : {}),
      ...(typeof candidate.diagnostics === 'boolean' ? { diagnostics: candidate.diagnostics } : {}),
      ...(typeof candidate.completion === 'boolean' ? { completion: candidate.completion } : {}),
      ...(typeof candidate.rename === 'boolean' ? { rename: candidate.rename } : {}),
      ...(typeof candidate.codeAction === 'boolean' ? { codeAction: candidate.codeAction } : {}),
      ...(typeof candidate.formatting === 'boolean' ? { formatting: candidate.formatting } : {}),
    };
  }

  private normalizeRuntime(value: unknown, capabilityIndex: number): PluginRuntime {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Plugin capability[${capabilityIndex}] runtime must be an object`);
    }

    const candidate = value as Partial<PluginRuntime>;
    if (!candidate.type || !['binary', 'node', 'java', 'python'].includes(candidate.type)) {
      throw new Error(`Plugin capability[${capabilityIndex}] runtime type is invalid`);
    }

    return {
      type: candidate.type,
      entry: requireNonEmptyString(candidate.entry, `plugin capability[${capabilityIndex}] runtime.entry`),
      ...(Array.isArray(candidate.args) ? { args: candidate.args.map((arg) => requireNonEmptyString(arg, `plugin capability[${capabilityIndex}] runtime arg`)) } : {}),
      ...(candidate.env && typeof candidate.env === 'object'
        ? {
            env: Object.fromEntries(
              Object.entries(candidate.env).map(([key, entry]) => [
                requireNonEmptyString(key, 'plugin runtime env key'),
                requireNonEmptyString(entry, `plugin runtime env ${key}`),
              ]),
            ),
          }
        : {}),
      ...(normalizeOptionalString(candidate.cwd) ? { cwd: normalizeOptionalString(candidate.cwd) } : {}),
    };
  }

  private normalizeRequirement(value: unknown, capabilityIndex: number, requirementIndex: number): PluginRequirement {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Plugin capability[${capabilityIndex}] requirement[${requirementIndex}] must be an object`);
    }

    const candidate = value as Partial<PluginRequirement>;
    if (!candidate.type || !['java', 'python', 'node', 'binary', 'env'].includes(candidate.type)) {
      throw new Error(`Plugin capability[${capabilityIndex}] requirement[${requirementIndex}] type is invalid`);
    }

    return {
      type: candidate.type,
      ...(normalizeOptionalString(candidate.version) ? { version: normalizeOptionalString(candidate.version) } : {}),
      ...(normalizeOptionalString(candidate.command) ? { command: normalizeOptionalString(candidate.command) } : {}),
      ...(normalizeOptionalString(candidate.envVar) ? { envVar: normalizeOptionalString(candidate.envVar) } : {}),
      ...(typeof candidate.optional === 'boolean' ? { optional: candidate.optional } : {}),
      ...(normalizeOptionalString(candidate.message) ? { message: normalizeOptionalString(candidate.message) } : {}),
    };
  }

  private normalizeSettingSchemaEntry(value: unknown): PluginSettingSchemaEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Plugin setting schema entry must be an object');
    }

    const candidate = value as Partial<PluginSettingSchemaEntry>;
    if (!candidate.type || !['boolean', 'string', 'number', 'enum'].includes(candidate.type)) {
      throw new Error('Plugin setting schema entry type is invalid');
    }

    if (!candidate.scope || !['global', 'workspace'].includes(candidate.scope)) {
      throw new Error('Plugin setting schema entry scope is invalid');
    }

    if (candidate.inputKind !== undefined) {
      if (candidate.type !== 'string') {
        throw new Error('Plugin setting schema entry inputKind requires a string type');
      }

      if (!['text', 'directory'].includes(candidate.inputKind)) {
        throw new Error('Plugin setting schema entry inputKind is invalid');
      }
    }

    return {
      type: candidate.type,
      title: requireNonEmptyString(candidate.title, 'plugin setting schema title'),
      scope: candidate.scope,
      ...(normalizeOptionalString(candidate.description) ? { description: normalizeOptionalString(candidate.description) } : {}),
      ...(candidate.inputKind ? { inputKind: candidate.inputKind } : {}),
      ...(normalizeOptionalString(candidate.placeholder) ? { placeholder: normalizeOptionalString(candidate.placeholder) } : {}),
      ...(candidate.defaultValue !== undefined ? { defaultValue: candidate.defaultValue } : {}),
      ...(Array.isArray(candidate.options)
        ? {
            options: candidate.options.map((option, index) => this.normalizeSettingOption(option, index)),
          }
        : {}),
    };
  }

  private normalizeSettingOption(value: unknown, index: number): PluginSettingOption {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`Plugin setting option[${index}] must be an object`);
    }

    const candidate = value as Partial<PluginSettingOption>;
    const optionValue = candidate.value;
    if (
      typeof optionValue !== 'string'
      && typeof optionValue !== 'number'
      && typeof optionValue !== 'boolean'
    ) {
      throw new Error(`Plugin setting option[${index}] value is invalid`);
    }

    return {
      label: requireNonEmptyString(candidate.label, `plugin setting option[${index}] label`),
      value: optionValue,
    };
  }
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  const normalized = uniqueStrings(value);
  if (normalized.length === 0) {
    throw new Error(`${fieldName} must not be empty`);
  }

  return normalized;
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return normalized;
}
