import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import type { ListTaskArtifactsQuery, SaveTaskArtifactRequest } from '../../shared/types/electron-api';
import type { TaskArtifactRecord } from '../../shared/types/task';
import { readJsonFileOrDefault, writeJsonFileAtomic } from './ssh/storeUtils';

interface ArtifactIndexDocument {
  schemaVersion: 1;
  artifacts: TaskArtifactRecord[];
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'artifact';
}

export class TaskArtifactService {
  private readonly rootDir: string;
  private readonly indexFilePath: string;

  constructor() {
    this.rootDir = path.join(app.getPath('userData'), 'artifacts');
    this.indexFilePath = path.join(this.rootDir, 'artifact-index.json');
  }

  async saveArtifact(request: SaveTaskArtifactRequest): Promise<TaskArtifactRecord> {
    await fs.ensureDir(this.rootDir);
    const createdAt = new Date().toISOString();
    const artifactId = randomUUID();
    const title = request.title.trim() || 'Artifact';
    const extension = request.markdown ? 'md' : 'json';
    const workspaceSegment = sanitizePathSegment(request.workspaceId ?? 'global');
    const conversationSegment = sanitizePathSegment(request.conversationId ?? artifactId);
    const fileName = `${sanitizePathSegment(title)}-${artifactId}.${extension}`;
    const artifactDir = path.join(this.rootDir, workspaceSegment, conversationSegment);
    const filePath = path.join(artifactDir, fileName);

    await fs.ensureDir(artifactDir);
    if (request.markdown !== undefined) {
      await fs.writeFile(filePath, request.markdown, 'utf8');
    } else {
      await writeJsonFileAtomic(filePath, request.json ?? {});
    }

    const stat = await fs.stat(filePath);
    const record: TaskArtifactRecord = {
      id: artifactId,
      kind: request.kind,
      title,
      createdAt,
      updatedAt: createdAt,
      workspaceId: request.workspaceId,
      windowId: request.windowId,
      paneId: request.paneId,
      conversationId: request.conversationId,
      filePath,
      contentType: request.markdown !== undefined ? 'text/markdown' : 'application/json',
      sizeBytes: stat.size,
      preview: request.preview,
    };

    const index = await this.readIndex();
    index.artifacts = [record, ...index.artifacts.filter((item) => item.id !== record.id)].slice(0, 500);
    await this.writeIndex(index);
    return record;
  }

  async listArtifacts(query: ListTaskArtifactsQuery = {}): Promise<TaskArtifactRecord[]> {
    const index = await this.readIndex();
    return index.artifacts
      .filter((artifact) => (
        (!query.workspaceId || artifact.workspaceId === query.workspaceId)
        && (!query.windowId || artifact.windowId === query.windowId)
        && (!query.paneId || artifact.paneId === query.paneId)
        && (!query.conversationId || artifact.conversationId === query.conversationId)
      ))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    const index = await this.readIndex();
    const artifact = index.artifacts.find((item) => item.id === artifactId);
    if (artifact) {
      await fs.remove(artifact.filePath).catch(() => {});
    }
    index.artifacts = index.artifacts.filter((item) => item.id !== artifactId);
    await this.writeIndex(index);
  }

  private async readIndex(): Promise<ArtifactIndexDocument> {
    return await readJsonFileOrDefault<ArtifactIndexDocument>(this.indexFilePath, {
      schemaVersion: 1,
      artifacts: [],
    });
  }

  private async writeIndex(index: ArtifactIndexDocument): Promise<void> {
    await writeJsonFileAtomic(this.indexFilePath, index);
  }
}
