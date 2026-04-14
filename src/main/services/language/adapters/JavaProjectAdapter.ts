import path from 'path';
import { homedir } from 'os';
import { statSync } from 'fs';
import type {
  CodePaneExternalLibrarySection,
  CodePaneProjectContribution,
  CodePaneProjectTreeItem,
} from '../../../../shared/types/electron-api';
import {
  createExternalLibraryRoot,
  createExternalLibrarySection,
  createProjectContribution,
  directoryExists,
  fileExists,
  findWorkspaceFiles,
  formatWorkspaceRelativePath,
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

    const springStatusItems = projectInfo.springInsights ? [
      {
        id: 'java-spring-endpoints',
        label: `Endpoints: ${projectInfo.springInsights.endpoints.length}`,
        tone: 'info' as const,
      },
      {
        id: 'java-spring-beans',
        label: `Beans: ${projectInfo.springInsights.beans.length}`,
        tone: 'info' as const,
      },
      {
        id: 'java-spring-configs',
        label: `Configs: ${projectInfo.springInsights.configFiles.length}`,
        tone: 'info' as const,
      },
    ] : [];

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
        ...springStatusItems,
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
        ...(projectInfo.springInsights ? [
          {
            id: 'java-spring-dashboard',
            title: 'Spring Boot',
            lines: [
              `Application: ${projectInfo.springInsights.applicationClass?.label ?? 'Not detected'}`,
              `Endpoints: ${projectInfo.springInsights.endpoints.length}`,
              `Beans: ${projectInfo.springInsights.beans.length}`,
              `Configs: ${projectInfo.springInsights.configFiles.length}`,
            ],
          },
        ] : []),
      ],
      treeSections: projectInfo.springInsights ? buildSpringTreeSections(workspaceRoot, projectInfo.springInsights) : undefined,
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
        id: 'java-project-sync',
        title: 'Project Sync',
        commands: buildJavaSyncCommands(workspaceRoot, projectInfo),
      },
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
  springInsights?: JavaSpringInsights;
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
  const isSpringBoot = /spring-boot/i.test(buildFileContent);

  return {
    buildTool,
    buildToolLabel: buildTool === 'maven' ? 'Maven' : 'Gradle',
    buildFilePath,
    mainSourcePath: path.join(workspaceRoot, 'src', 'main', 'java'),
    testSourcePath: path.join(workspaceRoot, 'src', 'test', 'java'),
    hasTests: await directoryExists(path.join(workspaceRoot, 'src', 'test', 'java')),
    isSpringBoot,
    ...(isSpringBoot ? { springInsights: await collectSpringInsights(workspaceRoot) } : {}),
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
      createJavaCommand(
        'java-gradle-test',
        'Test',
        `${gradleCommand} test`,
        gradleCommand,
        ['test'],
        workspaceRoot,
        {
          runKind: 'test',
        },
      ),
      createJavaCommand('java-gradle-dependencies', 'Dependencies', `${gradleCommand} dependencies`, gradleCommand, ['dependencies'], workspaceRoot),
      ...(projectInfo.isSpringBoot ? [
        createJavaCommand(
          'java-gradle-bootrun',
          'Boot Run',
          `${gradleCommand} bootRun`,
          gradleCommand,
          ['bootRun'],
          workspaceRoot,
          {
            runKind: 'application',
          },
        ),
        createJavaCommand(
          'java-gradle-boottest',
          'Boot Test',
          `${gradleCommand} test --tests *`,
          gradleCommand,
          ['test', '--tests', '*'],
          workspaceRoot,
          {
            runKind: 'test',
          },
        ),
      ] : []),
    ];
  }

  const mavenCommand = resolveMavenCommand(workspaceRoot);
  return [
    createJavaCommand('java-maven-compile', 'Compile', `${mavenCommand} compile`, mavenCommand, ['compile'], workspaceRoot),
    createJavaCommand(
      'java-maven-test',
      'Test',
      `${mavenCommand} test`,
      mavenCommand,
      ['test'],
      workspaceRoot,
      {
        runKind: 'test',
      },
    ),
    createJavaCommand('java-maven-package', 'Package', `${mavenCommand} package`, mavenCommand, ['package'], workspaceRoot),
    createJavaCommand('java-maven-dependency-tree', 'Dependency Tree', `${mavenCommand} dependency:tree`, mavenCommand, ['dependency:tree'], workspaceRoot),
    ...(projectInfo.isSpringBoot ? [
      createJavaCommand(
        'java-maven-spring-boot-run',
        'Spring Boot Run',
        `${mavenCommand} spring-boot:run`,
        mavenCommand,
        ['spring-boot:run'],
        workspaceRoot,
        {
          runKind: 'application',
        },
      ),
      createJavaCommand(
        'java-maven-spring-boot-test',
        'Spring Boot Test',
        `${mavenCommand} test -Dspring.profiles.active=dev`,
        mavenCommand,
        ['test', '-Dspring.profiles.active=dev'],
        workspaceRoot,
        {
          runKind: 'test',
        },
      ),
    ] : []),
  ];
}

function buildJavaSyncCommands(
  workspaceRoot: string,
  projectInfo: JavaProjectInfo,
): LanguageProjectCommandDefinition[] {
  if (projectInfo.buildTool === 'gradle') {
    const gradleCommand = resolveGradleCommand(workspaceRoot);
    return [
      createJavaProjectActionCommand(
        'java-gradle-refresh-model',
        'Refresh Gradle Model',
        'Reload Gradle project import and refresh workspace metadata',
        'refresh',
        'refresh-model',
      ),
      createJavaCommand(
        'java-gradle-refresh-dependencies',
        'Refresh Dependencies',
        `${gradleCommand} --refresh-dependencies classes`,
        gradleCommand,
        ['--refresh-dependencies', 'classes'],
        workspaceRoot,
        {
          kind: 'refresh',
        },
      ),
    ];
  }

  const mavenCommand = resolveMavenCommand(workspaceRoot);
  return [
    createJavaProjectActionCommand(
      'java-maven-refresh-model',
      'Reimport Maven Model',
      'Reload Maven project import and refresh workspace metadata',
      'refresh',
      'refresh-model',
    ),
    createJavaCommand(
      'java-maven-refresh-dependencies',
      'Refresh Dependencies',
      `${mavenCommand} -U dependency:resolve`,
      mavenCommand,
      ['-U', 'dependency:resolve'],
      workspaceRoot,
      {
        kind: 'refresh',
      },
    ),
  ];
}

interface JavaSpringInsightEntry {
  id: string;
  label: string;
  description: string;
  filePath: string;
  lineNumber: number;
}

interface JavaSpringInsights {
  applicationClass?: JavaSpringInsightEntry;
  endpoints: JavaSpringInsightEntry[];
  beans: JavaSpringInsightEntry[];
  configFiles: Array<{
    id: string;
    filePath: string;
    lineNumber: number;
  }>;
}

async function collectSpringInsights(workspaceRoot: string): Promise<JavaSpringInsights> {
  const javaFiles = await findWorkspaceFiles(workspaceRoot, ['src/main/java/**/*.java']);
  const configFiles = await findWorkspaceFiles(workspaceRoot, ['src/main/resources/application*.yml', 'src/main/resources/application*.yaml', 'src/main/resources/application*.properties']);
  const endpoints: JavaSpringInsightEntry[] = [];
  const beans: JavaSpringInsightEntry[] = [];
  let applicationClass: JavaSpringInsightEntry | undefined;

  for (const filePath of javaFiles) {
    const content = await readTextFile(filePath);
    if (!content) {
      continue;
    }

    const parsed = parseSpringJavaFile(filePath, content, workspaceRoot);
    endpoints.push(...parsed.endpoints);
    beans.push(...parsed.beans);
    if (!applicationClass && parsed.applicationClass) {
      applicationClass = parsed.applicationClass;
    }
  }

  return {
    ...(applicationClass ? { applicationClass } : {}),
    endpoints: deduplicateSpringEntries(endpoints),
    beans: deduplicateSpringEntries(beans),
    configFiles: configFiles.map((filePath) => ({
      id: `spring-config:${filePath}`,
      filePath,
      lineNumber: 1,
    })),
  };
}

function parseSpringJavaFile(
  filePath: string,
  content: string,
  workspaceRoot: string,
): {
  applicationClass?: JavaSpringInsightEntry;
  endpoints: JavaSpringInsightEntry[];
  beans: JavaSpringInsightEntry[];
} {
  const lines = content.split(/\r?\n/);
  const endpoints: JavaSpringInsightEntry[] = [];
  const beans: JavaSpringInsightEntry[] = [];
  let applicationClass: JavaSpringInsightEntry | undefined;
  let pendingAnnotations: string[] = [];
  let currentControllerClassName: string | null = null;
  let currentBasePaths: string[] = [''];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      continue;
    }

    if (trimmedLine.startsWith('@')) {
      pendingAnnotations.push(trimmedLine);
      continue;
    }

    const classMatch = trimmedLine.match(/(?:public\s+)?(?:abstract\s+|final\s+)?(?:class|record|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/);
    if (classMatch) {
      const className = classMatch[1];
      const stereotype = resolveSpringStereotype(pendingAnnotations);
      if (stereotype) {
        beans.push({
          id: `spring-bean:${filePath}:${className}:${index + 1}`,
          label: className,
          description: `${stereotype} · ${formatWorkspaceRelativePath(workspaceRoot, filePath)}`,
          filePath,
          lineNumber: index + 1,
        });
      }

      if (pendingAnnotations.some((annotation) => annotation.includes('@SpringBootApplication'))) {
        applicationClass = {
          id: `spring-app:${filePath}:${className}`,
          label: className,
          description: formatWorkspaceRelativePath(workspaceRoot, filePath),
          filePath,
          lineNumber: index + 1,
        };
      }

      currentControllerClassName = pendingAnnotations.some(isControllerAnnotation) ? className : null;
      currentBasePaths = extractRequestPaths(pendingAnnotations);
      if (currentBasePaths.length === 0) {
        currentBasePaths = [''];
      }
      pendingAnnotations = [];
      continue;
    }

    const methodMatch = trimmedLine.match(/(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:<[^>]+>\s+)?[A-Za-z_$][A-Za-z0-9_$<>, ?\[\]]*\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/);
    if (methodMatch) {
      const methodName = methodMatch[1];
      if (pendingAnnotations.some((annotation) => annotation.startsWith('@Bean'))) {
        beans.push({
          id: `spring-bean-method:${filePath}:${methodName}:${index + 1}`,
          label: `${methodName}()`,
          description: `@Bean · ${formatWorkspaceRelativePath(workspaceRoot, filePath)}`,
          filePath,
          lineNumber: index + 1,
        });
      }

      const mappingAnnotations = pendingAnnotations.filter(isRequestMappingAnnotation);
      if (mappingAnnotations.length > 0 && currentControllerClassName) {
        const methodPaths = extractRequestPaths(mappingAnnotations);
        const httpMethods = extractHttpMethods(mappingAnnotations);
        const normalizedMethodPaths = methodPaths.length > 0 ? methodPaths : [''];

        for (const httpMethod of httpMethods) {
          for (const methodPath of normalizedMethodPaths) {
            endpoints.push({
              id: `spring-endpoint:${filePath}:${methodName}:${httpMethod}:${methodPath}:${index + 1}`,
              label: `${httpMethod} ${joinSpringPaths(currentBasePaths[0] ?? '', methodPath)}`,
              description: `${currentControllerClassName}.${methodName} · ${formatWorkspaceRelativePath(workspaceRoot, filePath)}`,
              filePath,
              lineNumber: index + 1,
            });
          }
        }
      }

      pendingAnnotations = [];
      continue;
    }

    pendingAnnotations = [];
  }

  return {
    ...(applicationClass ? { applicationClass } : {}),
    endpoints,
    beans,
  };
}

function buildSpringTreeSections(workspaceRoot: string, insights: JavaSpringInsights) {
  const sections: Array<{ id: string; title: string; items: CodePaneProjectTreeItem[] }> = [];

  if (insights.endpoints.length > 0) {
    sections.push({
      id: 'spring-endpoints',
      title: 'Request Mappings',
      items: insights.endpoints.map((endpoint) => ({
        id: endpoint.id,
        label: endpoint.label,
        kind: 'entry',
        description: endpoint.description,
        filePath: endpoint.filePath,
        lineNumber: endpoint.lineNumber,
      })),
    });
  }

  if (insights.beans.length > 0) {
    sections.push({
      id: 'spring-beans',
      title: 'Beans',
      items: insights.beans.map((bean) => ({
        id: bean.id,
        label: bean.label,
        kind: 'entry',
        description: bean.description,
        filePath: bean.filePath,
        lineNumber: bean.lineNumber,
      })),
    });
  }

  if (insights.configFiles.length > 0) {
    sections.push({
      id: 'spring-configs',
      title: 'Config Files',
      items: insights.configFiles.map((configFile) => ({
        id: configFile.id,
        label: formatWorkspaceRelativePath(workspaceRoot, configFile.filePath),
        kind: 'entry',
        description: 'Spring configuration',
        filePath: configFile.filePath,
        lineNumber: configFile.lineNumber,
      })),
    });
  }

  return sections;
}

function deduplicateSpringEntries(entries: JavaSpringInsightEntry[]): JavaSpringInsightEntry[] {
  const seenIds = new Set<string>();
  return entries.filter((entry) => {
    if (seenIds.has(entry.id)) {
      return false;
    }

    seenIds.add(entry.id);
    return true;
  });
}

function resolveSpringStereotype(annotations: string[]): string | null {
  for (const annotation of annotations) {
    if (annotation.startsWith('@RestController')) {
      return '@RestController';
    }
    if (annotation.startsWith('@Controller')) {
      return '@Controller';
    }
    if (annotation.startsWith('@Service')) {
      return '@Service';
    }
    if (annotation.startsWith('@Repository')) {
      return '@Repository';
    }
    if (annotation.startsWith('@Component')) {
      return '@Component';
    }
    if (annotation.startsWith('@Configuration')) {
      return '@Configuration';
    }
  }

  return null;
}

function isControllerAnnotation(annotation: string): boolean {
  return annotation.startsWith('@RestController')
    || annotation.startsWith('@Controller')
    || annotation.startsWith('@RequestMapping');
}

function isRequestMappingAnnotation(annotation: string): boolean {
  return annotation.startsWith('@RequestMapping')
    || annotation.startsWith('@GetMapping')
    || annotation.startsWith('@PostMapping')
    || annotation.startsWith('@PutMapping')
    || annotation.startsWith('@DeleteMapping')
    || annotation.startsWith('@PatchMapping');
}

function extractRequestPaths(annotations: string[]): string[] {
  const paths = annotations.flatMap((annotation) => {
    const quotedValues = Array.from(annotation.matchAll(/["']([^"']+)["']/g), (match) => match[1]);
    return quotedValues.length > 0 ? quotedValues : [];
  });

  return paths.length > 0 ? paths : [];
}

function extractHttpMethods(annotations: string[]): string[] {
  const methods = new Set<string>();
  for (const annotation of annotations) {
    if (annotation.startsWith('@GetMapping')) {
      methods.add('GET');
    } else if (annotation.startsWith('@PostMapping')) {
      methods.add('POST');
    } else if (annotation.startsWith('@PutMapping')) {
      methods.add('PUT');
    } else if (annotation.startsWith('@DeleteMapping')) {
      methods.add('DELETE');
    } else if (annotation.startsWith('@PatchMapping')) {
      methods.add('PATCH');
    } else if (annotation.startsWith('@RequestMapping')) {
      const requestMethods = Array.from(annotation.matchAll(/RequestMethod\.([A-Z]+)/g), (match) => match[1]);
      if (requestMethods.length === 0) {
        methods.add('ANY');
      } else {
        requestMethods.forEach((method) => methods.add(method));
      }
    }
  }

  return methods.size > 0 ? Array.from(methods) : ['ANY'];
}

function joinSpringPaths(basePath: string, methodPath: string): string {
  const joined = `${basePath || ''}/${methodPath || ''}`
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return joined.startsWith('/') ? joined : `/${joined}`.replace(/\/+/g, '/');
}

function createJavaCommand(
  id: string,
  title: string,
  detail: string,
  command: string,
  args: string[],
  workingDirectory: string,
  options: {
    kind?: LanguageProjectCommandDefinition['kind'];
    runKind?: LanguageProjectCommandDefinition['runKind'];
  } = {},
): LanguageProjectCommandDefinition {
  return {
    id,
    title,
    detail,
    command,
    args,
    workingDirectory,
    languageId: 'java',
    kind: options.kind ?? 'run',
    runKind: options.runKind ?? 'task',
  };
}

function createJavaProjectActionCommand(
  id: string,
  title: string,
  detail: string,
  kind: LanguageProjectCommandDefinition['kind'],
  actionType: LanguageProjectCommandDefinition['actionType'],
): LanguageProjectCommandDefinition {
  return {
    id,
    title,
    detail,
    languageId: 'java',
    kind,
    actionType,
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
