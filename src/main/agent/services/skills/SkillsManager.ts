export interface SkillsPromptContext {
  sshBound: boolean;
  userMessage: string;
}

interface BuiltinSkill {
  id: string;
  title: string;
  description: string;
  instructions: string;
}

const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    id: 'remote-diagnostics',
    title: 'Remote Diagnostics',
    description: '对远端主机做只读诊断，先收集事实再下结论。',
    instructions: [
      '诊断顺序优先为：环境与权限、进程/端口、日志、配置、资源、网络连通性。',
      '当信息不足时继续收集事实，不要基于猜测直接给修复结论。',
      '对于可能影响业务的操作，先申请审批，再执行。',
    ].join('\n'),
  },
  {
    id: 'interactive-terminal',
    title: 'Interactive Terminal',
    description: '识别密码、确认、分页器和菜单，必要时请求用户输入。',
    instructions: [
      '当命令出现密码、确认、分页器或菜单选择时，不要假装已经继续执行。',
      '应明确等待用户输入，并在收到输入后继续同一条命令。',
    ].join('\n'),
  },
];

export class SkillsManager {
  listSkills(): BuiltinSkill[] {
    return [...BUILTIN_SKILLS];
  }

  getSystemPromptAddendum(context: SkillsPromptContext): string {
    const activeSkills = BUILTIN_SKILLS.filter((skill) => (
      skill.id !== 'remote-diagnostics' || context.sshBound
    ));

    return [
      '内置技能：',
      ...activeSkills.map((skill) => `- ${skill.title}: ${skill.instructions}`),
    ].join('\n');
  }
}
