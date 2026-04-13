import type { CodePaneExternalLibrarySection } from '../../../../shared/types/electron-api';
import { GoProjectAdapter } from './GoProjectAdapter';
import { JavaProjectAdapter } from './JavaProjectAdapter';
import type { LanguageProjectAdapter } from './LanguageProjectAdapter';
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
}
