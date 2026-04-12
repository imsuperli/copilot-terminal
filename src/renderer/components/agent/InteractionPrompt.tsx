import React, { useState } from 'react';
import type { AgentPendingInteraction } from '../../../shared/types/agent';

export function InteractionPrompt({
  interaction,
  onSubmit,
  onCancel,
}: {
  interaction: AgentPendingInteraction;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');

  return (
    <div className="rounded-[22px] border border-sky-500/20 bg-sky-500/10 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-sky-100/80">
        Interactive command
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-sky-50/95">
        {interaction.prompt}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <input
          type={interaction.secret ? 'password' : 'text'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 rounded-2xl border border-zinc-800/90 bg-zinc-950/90 px-4 text-sm text-zinc-100 outline-none"
          placeholder="Send input to the running command"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onSubmit(value)}
            className="rounded-full bg-[rgb(var(--primary))] px-4 py-2 text-sm font-medium text-[rgb(var(--primary-foreground))]"
          >
            {interaction.submitLabel || 'Submit'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100"
          >
            Cancel command
          </button>
        </div>
      </div>
    </div>
  );
}
