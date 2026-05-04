import { v4 as uuidv4 } from 'uuid';
import type {
  AgentCancelRequest,
  AgentGetTaskRequest,
  AgentResetRequest,
  AgentRespondApprovalRequest,
  AgentRestoreTaskRequest,
  AgentSendRequest,
  AgentSendResponse,
  AgentSubmitInteractionRequest,
  AgentTaskSnapshot,
} from '../../../../shared/types/agent';
import type { LLMProviderConfig } from '../../../../shared/types/chat';
import { ChatService } from '../../../services/chat/ChatService';
import { ToolExecutor } from '../../../services/chat/ToolExecutor';
import type { ProcessManager } from '../../../services/ProcessManager';
import { RemoteTerminalManager } from '../../integrations/remote-terminal';
import { McpHub } from '../../services/mcp/McpHub';
import { SkillsManager } from '../../services/skills/SkillsManager';
import { AgentTask } from '../task/AgentTask';

interface AgentControllerOptions {
  processManager: ProcessManager | null;
  resolveProvider: (providerId: string) => Promise<LLMProviderConfig | null>;
  commandSecurityEnabled: () => boolean;
  postState: (snapshot: AgentTaskSnapshot) => void;
  postEvent: (payload: { paneId: string; taskId: string; event: AgentTaskSnapshot['timeline'][number] }) => void;
  postError: (payload: { paneId: string; taskId: string; error: string }) => void;
}

export class AgentController {
  private readonly tasksByPaneId = new Map<string, AgentTask>();
  private readonly tasksByTaskId = new Map<string, AgentTask>();
  private readonly chatService = new ChatService();
  private readonly mcpHub = new McpHub();
  private readonly skillsManager = new SkillsManager();
  private readonly toolExecutor: ToolExecutor | null;
  private readonly remoteTerminalManager: RemoteTerminalManager | null;
  private readonly options: AgentControllerOptions;

  constructor(options: AgentControllerOptions) {
    this.options = options;
    this.toolExecutor = options.processManager ? new ToolExecutor(options.processManager) : null;
    this.remoteTerminalManager = options.processManager
      ? new RemoteTerminalManager(options.processManager)
      : null;
  }

  async send(request: AgentSendRequest): Promise<AgentSendResponse> {
    const provider = await this.options.resolveProvider(request.providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${request.providerId}`);
    }

    let task = this.tasksByPaneId.get(request.paneId);
    if (!task) {
      task = this.createTask(request);
      this.attachTask(task);
    }

    task.start(request, provider);
    return {
      taskId: task.getSnapshot().taskId,
      status: task.getSnapshot().status,
    };
  }

  getTask(request: AgentGetTaskRequest): AgentTaskSnapshot | null {
    const task = request.taskId
      ? this.tasksByTaskId.get(request.taskId)
      : this.tasksByPaneId.get(request.paneId);

    return task?.getSnapshot() ?? null;
  }

  cancel(request: AgentCancelRequest): void {
    const task = this.resolveTask(request);
    task?.cancel();
  }

  reset(request: AgentResetRequest): void {
    const task = this.resolveTask(request);
    if (!task) {
      return;
    }

    task.cancel();
    this.detachTask(task);
  }

  respondApproval(request: AgentRespondApprovalRequest): void {
    const task = this.tasksByTaskId.get(request.taskId);
    if (!task) {
      throw new Error(`Task not found: ${request.taskId}`);
    }
    task.respondApproval(request);
  }

  submitInteraction(request: AgentSubmitInteractionRequest): void {
    const task = this.tasksByTaskId.get(request.taskId);
    if (!task) {
      throw new Error(`Task not found: ${request.taskId}`);
    }
    task.submitInteraction(request);
  }

  restore(request: AgentRestoreTaskRequest): AgentTaskSnapshot {
    const existingByTaskId = this.tasksByTaskId.get(request.task.taskId);
    if (existingByTaskId) {
      return existingByTaskId.getSnapshot();
    }

    const restoredSnapshot = AgentTask.prepareSnapshotForRestore(request.task);
    const task = new AgentTask(restoredSnapshot, {
      chatService: this.chatService,
      toolExecutor: this.toolExecutor,
      remoteTerminalManager: this.remoteTerminalManager,
      skillsManager: this.skillsManager,
      mcpHub: this.mcpHub,
      commandSecurityEnabled: this.options.commandSecurityEnabled(),
      postState: this.options.postState,
      postEvent: this.options.postEvent,
      postError: this.options.postError,
    });
    this.attachTask(task);
    this.options.postState(task.getSnapshot());
    return task.getSnapshot();
  }

  disposePane(paneId: string): void {
    const task = this.tasksByPaneId.get(paneId);
    if (!task) {
      return;
    }

    task.cancel();
    this.detachTask(task);
  }

  private createTask(request: AgentSendRequest): AgentTask {
    const snapshot: AgentTaskSnapshot = {
      taskId: uuidv4(),
      paneId: request.paneId,
      windowId: request.windowId,
      status: 'idle',
      providerId: request.providerId,
      model: request.model,
      linkedPaneId: request.linkedPaneId,
      sshContext: request.sshContext,
      timeline: [],
      messages: [],
      offloadRefs: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return new AgentTask(snapshot, {
      chatService: this.chatService,
      toolExecutor: this.toolExecutor,
      remoteTerminalManager: this.remoteTerminalManager,
      skillsManager: this.skillsManager,
      mcpHub: this.mcpHub,
      commandSecurityEnabled: this.options.commandSecurityEnabled(),
      postState: this.options.postState,
      postEvent: this.options.postEvent,
      postError: this.options.postError,
    });
  }

  private resolveTask(request: Pick<AgentCancelRequest, 'paneId' | 'taskId'>): AgentTask | null {
    return request.taskId
      ? this.tasksByTaskId.get(request.taskId) ?? null
      : this.tasksByPaneId.get(request.paneId) ?? null;
  }

  private attachTask(task: AgentTask): void {
    const snapshot = task.getSnapshot();
    const existingTask = this.tasksByPaneId.get(snapshot.paneId);
    if (existingTask && existingTask.getSnapshot().taskId !== snapshot.taskId) {
      this.detachTask(existingTask);
    }

    this.tasksByPaneId.set(snapshot.paneId, task);
    this.tasksByTaskId.set(snapshot.taskId, task);
  }

  private detachTask(task: AgentTask): void {
    const snapshot = task.getSnapshot();
    const currentByPane = this.tasksByPaneId.get(snapshot.paneId);
    if (currentByPane?.getSnapshot().taskId === snapshot.taskId) {
      this.tasksByPaneId.delete(snapshot.paneId);
    }
    this.tasksByTaskId.delete(snapshot.taskId);
  }

  getMcpHub(): McpHub {
    return this.mcpHub;
  }
}
