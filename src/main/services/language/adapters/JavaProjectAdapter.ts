import path from 'path';
import { homedir } from 'os';
import type { CodePaneExternalLibrarySection } from '../../../../shared/types/electron-api';
import {
  createExternalLibraryRoot,
  createExternalLibrarySection,
  directoryExists,
  hasProjectIndicators,
  type LanguageProjectAdapter,
} from './LanguageProjectAdapter';

const JAVA_PROJECT_INDICATORS = [
  'pom.xml',
  'mvnw',
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  path.join('src', 'main', 'java'),
  path.join('src', 'test', 'java'),
];

export class JavaProjectAdapter implements LanguageProjectAdapter {
  readonly languageId = 'java';

  async getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null> {
    if (!await hasProjectIndicators(workspaceRoot, JAVA_PROJECT_INDICATORS)) {
      return null;
    }

    const roots = [];
    const mavenRepositoryPath = path.join(homedir(), '.m2', 'repository');
    if (await directoryExists(mavenRepositoryPath)) {
      roots.push(createExternalLibraryRoot(
        'maven-repository',
        'Maven Repository',
        mavenRepositoryPath,
      ));
    }

    const gradleCachePath = path.join(homedir(), '.gradle', 'caches', 'modules-2', 'files-2.1');
    if (await directoryExists(gradleCachePath)) {
      roots.push(createExternalLibraryRoot(
        'gradle-cache',
        'Gradle Cache',
        gradleCachePath,
      ));
    }

    return createExternalLibrarySection('java-external-libraries', this.languageId, roots);
  }
}
