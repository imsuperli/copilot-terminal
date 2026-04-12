import React from 'react';
import type { AgentPendingApproval } from '../../../shared/types/agent';

export function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  approval: AgentPendingApproval;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-[22px] border border-red-500/20 bg-red-500/10 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-red-200/90">Approval required</div>
      <div className="mt-3 text-sm leading-7 text-red-50/95">
        {approval.reason || 'This command requires explicit approval.'}
      </div>
      {'command' in approval.toolCall.params && typeof approval.toolCall.params.command === 'string' && (
        <pre className="mt-3 overflow-x-auto rounded-2xl border border-red-500/10 bg-[#0d0d10] px-3 py-2.5 font-mono text-[12px] leading-6 text-zinc-100">
          {approval.toolCall.params.command}
        </pre>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="rounded-full bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-[rgb(var(--primary-foreground))]"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
