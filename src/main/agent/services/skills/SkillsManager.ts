export interface SkillsPromptContext {
  sshBound: boolean;
  userMessage: string;
}

interface BuiltinSkill {
  id: string;
  title: string;
  description: string;
  instructions: string;
  keywords?: string[];
  alwaysActive?: boolean;
}

const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    id: 'remote-diagnostics',
    title: 'Remote Diagnostics',
    description: '对远端主机做只读诊断，先收集事实再下结论。',
    alwaysActive: true,
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
    keywords: ['password', 'passphrase', 'sudo', '确认', '交互', 'interactive', 'login'],
    instructions: [
      '当命令出现密码、确认、分页器或菜单选择时，不要假装已经继续执行。',
      '应明确等待用户输入，并在收到输入后继续同一条命令。',
    ].join('\n'),
  },
  {
    id: 'log-analysis',
    title: 'Log Analysis',
    description: '围绕日志、报错、stack trace、journal 和 service 输出来排查问题。',
    keywords: ['log', '日志', 'error', '异常', 'stack', 'journal', 'trace'],
    instructions: [
      '优先定位具体报错时间、服务名、错误栈和上下文，不要泛泛地说“看日志”。',
      '先确认问题是否可复现，再对照配置和进程状态做交叉验证。',
    ].join('\n'),
  },
];

export class SkillsManager {
  listSkills(): BuiltinSkill[] {
    return [...BUILTIN_SKILLS];
  }

  getActiveSkills(context: SkillsPromptContext): BuiltinSkill[] {
    const normalizedMessage = context.userMessage.toLowerCase();
    return BUILTIN_SKILLS.filter((skill) => {
      if (!context.sshBound && skill.id === 'remote-diagnostics') {
        return false;
      }

      if (skill.alwaysActive) {
        return context.sshBound;
      }

      return skill.keywords?.some((keyword) => normalizedMessage.includes(keyword.toLowerCase())) ?? false;
    });
  }

  getSystemPromptAddendum(context: SkillsPromptContext): string {
    const activeSkills = this.getActiveSkills(context);

    return [
      '已激活技能：',
      ...activeSkills.map((skill) => `- ${skill.title}: ${skill.instructions}`),
      activeSkills.length === 0 ? '- 当前没有匹配到额外技能，按通用远端排障流程处理。' : '',
    ].join('\n');
  }
}
