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
    <div className="rounded-[22px] border border-[rgb(var(--error))]/25 bg-[rgb(var(--error))]/10 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[rgb(var(--error))]">Approval required</div>
      <div className="mt-3 text-sm leading-7 text-[rgb(var(--foreground))]">
        {approval.reason || 'This command requires explicit approval.'}
      </div>
      {'command' in approval.toolCall.params && typeof approval.toolCall.params.command === 'string' && (
        <pre className="mt-3 overflow-x-auto rounded-2xl border border-[rgb(var(--error))]/20 bg-[color-mix(in_srgb,rgb(var(--background))_82%,transparent)] px-3 py-2.5 font-mono text-[12px] leading-6 text-[rgb(var(--foreground))]">
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
          className="rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_78%,transparent)] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
