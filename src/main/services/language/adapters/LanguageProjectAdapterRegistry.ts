import type {
  CodePaneExternalLibrarySection,
  CodePaneProjectContribution,
} from '../../../../shared/types/electron-api';
import { GoProjectAdapter } from './GoProjectAdapter';
import { JavaProjectAdapter } from './JavaProjectAdapter';
import type {
  LanguageProjectAdapter,
  LanguageProjectCommandDefinition,
} from './LanguageProjectAdapter';
import { PythonProjectAdapter } from './PythonProjectAdapter';

export interface LanguageProjectAdapterRegistryOptions {
  adapters?: LanguageProjectAdapter[];
}

export class LanguageProjectAdapterRegistry {
  private readonly adapters: LanguageProjectAdapter[];

  constructor(options: LanguageProjectAdapterRegistryOptions = {}) {
    this.adapters = options.adapters ?? [
      new JavaProjectAdapter(),
      new PythonProjectAdapter(),
      new GoProjectAdapter(),
    ];
  }

  async getExternalLibrarySections(workspaceRoot: string): Promise<CodePaneExternalLibrarySection[]> {
    const sections = await Promise.all(this.adapters.map((adapter) => (
      adapter.getExternalLibrarySection(workspaceRoot)
    )));

    return sections.filter((section): section is CodePaneExternalLibrarySection => Boolean(section));
  }

  async getProjectContributions(workspaceRoot: string): Promise<CodePaneProjectContribution[]> {
    const contributions = await Promise.all(this.adapters.map((adapter) => (
      adapter.getProjectContribution(workspaceRoot)
    )));

    return contributions.filter((contribution): contribution is CodePaneProjectContribution => Boolean(contribution));
  }

  async resolveProjectCommand(workspaceRoot: string, commandId: string): Promise<LanguageProjectCommandDefinition | null> {
    for (const adapter of this.adapters) {
      const command = await adapter.resolveProjectCommand(workspaceRoot, commandId);
      if (command) {
        return command;
      }
    }

    return null;
  }
}
