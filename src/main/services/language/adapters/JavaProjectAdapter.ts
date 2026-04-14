import path from 'path';
import { homedir } from 'os';
import { statSync } from 'fs';
import type {
  CodePaneExternalLibrarySection,
  CodePaneProjectContribution,
} from '../../../../shared/types/electron-api';
import {
  createExternalLibraryRoot,
  createExternalLibrarySection,
  createProjectContribution,
  directoryExists,
  fileExists,
  hasProjectIndicators,
  readTextFile,
  type LanguageProjectAdapter,
  type LanguageProjectCommandDefinition,
  type LanguageProjectCommandGroupDefinition,
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

  async getProjectContribution(workspaceRoot: string): Promise<CodePaneProjectContribution | null> {
    const projectInfo = await detectJavaProject(workspaceRoot);
    if (!projectInfo) {
      return null;
    }

    return createProjectContribution('java-project', this.languageId, 'Java Project', {
      statusItems: [
        {
          id: 'java-build-tool',
          label: `Build: ${projectInfo.buildToolLabel}`,
          tone: 'info',
        },
        {
          id: 'java-tests',
          label: projectInfo.hasTests ? 'Tests detected' : 'No tests detected',
          tone: projectInfo.hasTests ? 'info' : 'warning',
        },
        {
          id: 'java-spring-boot',
          label: projectInfo.isSpringBoot ? 'Spring Boot detected' : 'Standard Java project',
          tone: projectInfo.isSpringBoot ? 'info' : 'warning',
        },
      ],
      detailCards: [
        {
          id: 'java-project-files',
          title: 'Project Files',
          lines: [
            `Root: ${workspaceRoot}`,
            `Build file: ${projectInfo.buildFilePath}`,
            `Main sources: ${projectInfo.mainSourcePath}`,
            `Test sources: ${projectInfo.testSourcePath}`,
          ],
        },
      ],
      commandGroups: await this.getCommandGroups(workspaceRoot, projectInfo),
    });
  }

  async resolveProjectCommand(workspaceRoot: string, commandId: string): Promise<LanguageProjectCommandDefinition | null> {
    const projectInfo = await detectJavaProject(workspaceRoot);
    if (!projectInfo) {
      return null;
    }

    const commandGroups = await this.getCommandGroups(workspaceRoot, projectInfo);
    for (const group of commandGroups) {
      for (const command of group.commands) {
        if (command.id === commandId) {
          return command;
        }
      }
    }

    return null;
  }

  private async getCommandGroups(
    workspaceRoot: string,
    projectInfo: JavaProjectInfo,
  ): Promise<LanguageProjectCommandGroupDefinition[]> {
    return [
      {
        id: 'java-build',
        title: projectInfo.buildToolLabel,
        commands: buildJavaCommandDefinitions(workspaceRoot, projectInfo),
      },
    ];
  }
}

interface JavaProjectInfo {
  buildTool: 'maven' | 'gradle';
  buildToolLabel: string;
  buildFilePath: string;
  mainSourcePath: string;
  testSourcePath: string;
  hasTests: boolean;
  isSpringBoot: boolean;
}

async function detectJavaProject(workspaceRoot: string): Promise<JavaProjectInfo | null> {
  if (!await hasProjectIndicators(workspaceRoot, JAVA_PROJECT_INDICATORS)) {
    return null;
  }

  const pomPath = path.join(workspaceRoot, 'pom.xml');
  const gradlePath = await resolveGradleBuildFile(workspaceRoot);
  const buildTool = await fileExists(pomPath) ? 'maven' : gradlePath ? 'gradle' : 'maven';
  const buildFilePath = buildTool === 'maven'
    ? pomPath
    : (gradlePath ?? path.join(workspaceRoot, 'build.gradle'));
  const buildFileContent = await readTextFile(buildFilePath) ?? '';

  return {
    buildTool,
    buildToolLabel: buildTool === 'maven' ? 'Maven' : 'Gradle',
    buildFilePath,
    mainSourcePath: path.join(workspaceRoot, 'src', 'main', 'java'),
    testSourcePath: path.join(workspaceRoot, 'src', 'test', 'java'),
    hasTests: await directoryExists(path.join(workspaceRoot, 'src', 'test', 'java')),
    isSpringBoot: /spring-boot/i.test(buildFileContent),
  };
}

function buildJavaCommandDefinitions(
  workspaceRoot: string,
  projectInfo: JavaProjectInfo,
): LanguageProjectCommandDefinition[] {
  if (projectInfo.buildTool === 'gradle') {
    const gradleCommand = resolveGradleCommand(workspaceRoot);
    return [
      createJavaCommand('java-gradle-build', 'Build', `${gradleCommand} build`, gradleCommand, ['build'], workspaceRoot),
      createJavaCommand('java-gradle-test', 'Test', `${gradleCommand} test`, gradleCommand, ['test'], workspaceRoot),
      createJavaCommand('java-gradle-dependencies', 'Dependencies', `${gradleCommand} dependencies`, gradleCommand, ['dependencies'], workspaceRoot),
      ...(projectInfo.isSpringBoot ? [
        createJavaCommand('java-gradle-bootrun', 'Boot Run', `${gradleCommand} bootRun`, gradleCommand, ['bootRun'], workspaceRoot),
      ] : []),
    ];
  }

  const mavenCommand = resolveMavenCommand(workspaceRoot);
  return [
    createJavaCommand('java-maven-compile', 'Compile', `${mavenCommand} compile`, mavenCommand, ['compile'], workspaceRoot),
    createJavaCommand('java-maven-test', 'Test', `${mavenCommand} test`, mavenCommand, ['test'], workspaceRoot),
    createJavaCommand('java-maven-package', 'Package', `${mavenCommand} package`, mavenCommand, ['package'], workspaceRoot),
    createJavaCommand('java-maven-dependency-tree', 'Dependency Tree', `${mavenCommand} dependency:tree`, mavenCommand, ['dependency:tree'], workspaceRoot),
    ...(projectInfo.isSpringBoot ? [
      createJavaCommand('java-maven-spring-boot-run', 'Spring Boot Run', `${mavenCommand} spring-boot:run`, mavenCommand, ['spring-boot:run'], workspaceRoot),
    ] : []),
  ];
}

function createJavaCommand(
  id: string,
  title: string,
  detail: string,
  command: string,
  args: string[],
  workingDirectory: string,
  kind: LanguageProjectCommandDefinition['kind'] = 'task',
): LanguageProjectCommandDefinition {
  return {
    id,
    title,
    detail,
    command,
    args,
    workingDirectory,
    languageId: 'java',
    kind,
  };
}

async function resolveGradleBuildFile(workspaceRoot: string): Promise<string | null> {
  for (const fileName of ['build.gradle.kts', 'build.gradle']) {
    const filePath = path.join(workspaceRoot, fileName);
    if (await fileExists(filePath)) {
      return filePath;
    }
  }

  return null;
}

function resolveMavenCommand(workspaceRoot: string): string {
  const mvnwPath = process.platform === 'win32'
    ? path.join(workspaceRoot, 'mvnw.cmd')
    : path.join(workspaceRoot, 'mvnw');
  if (process.platform === 'win32') {
    if (path.basename(mvnwPath).toLowerCase() === 'mvnw.cmd') {
      return fileExistsSync(mvnwPath) ? mvnwPath : 'mvn.cmd';
    }
  }

  return fileExistsSync(mvnwPath) ? mvnwPath : resolveExecutable('mvn');
}

function resolveGradleCommand(workspaceRoot: string): string {
  const wrapperPath = process.platform === 'win32'
    ? path.join(workspaceRoot, 'gradlew.bat')
    : path.join(workspaceRoot, 'gradlew');
  if (fileExistsSync(wrapperPath)) {
    return wrapperPath;
  }

  return resolveExecutable('gradle');
}

function resolveExecutable(command: string): string {
  if (process.platform === 'win32') {
    if (command === 'mvn') {
      return 'mvn.cmd';
    }
    if (command === 'gradle') {
      return 'gradle.bat';
    }
  }

  return command;
}

function fileExistsSync(targetPath: string): boolean {
  try {
    return statSync(targetPath).isFile();
  } catch {
    return false;
  }
}
