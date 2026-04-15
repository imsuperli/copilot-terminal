import fs from 'fs-extra';
import path from 'path';

export interface ProjectRootResolverConfig {
  workspaceRoot: string;
  filePath: string;
  projectIndicators?: string[];
}

export interface ProjectRootResolution {
  projectRoot: string;
  matchedIndicator: string | null;
}

export class ProjectRootResolver {
  async resolve(config: ProjectRootResolverConfig): Promise<string> {
    return (await this.resolveDetailed(config)).projectRoot;
  }

  async resolveDetailed(config: ProjectRootResolverConfig): Promise<ProjectRootResolution> {
    const workspaceRoot = normalizePath(config.workspaceRoot);
    const fileDirectory = normalizePath(path.dirname(config.filePath));
    const indicators = Array.from(new Set(config.projectIndicators ?? [])).filter(Boolean);

    if (indicators.length === 0) {
      return {
        projectRoot: workspaceRoot,
        matchedIndicator: null,
      };
    }

    let currentPath = fileDirectory;
    while (isPathInside(workspaceRoot, currentPath)) {
      for (const indicator of indicators) {
        if (await fs.pathExists(path.join(currentPath, indicator))) {
          return {
            projectRoot: currentPath,
            matchedIndicator: indicator,
          };
        }
      }

      if (currentPath === workspaceRoot) {
        break;
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        break;
      }
      currentPath = normalizePath(parentPath);
    }

    return {
      projectRoot: workspaceRoot,
      matchedIndicator: null,
    };
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  return candidatePath === parentPath || candidatePath.startsWith(`${parentPath}/`);
}
