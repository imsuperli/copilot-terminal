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
    <div className="rounded-[22px] border border-[rgb(var(--primary))]/25 bg-[rgb(var(--primary))]/10 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[rgb(var(--primary))]">
        Interactive command
      </div>
      <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[rgb(var(--foreground))]">
        {interaction.prompt}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <input
          type={interaction.secret ? 'password' : 'text'}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 rounded-2xl border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--background))_82%,transparent)] px-4 text-sm text-[rgb(var(--foreground))] outline-none transition-colors focus:border-[rgb(var(--ring))] focus:ring-2 focus:ring-[rgb(var(--ring))]/20"
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
            className="rounded-full border border-[rgb(var(--border))] bg-[color-mix(in_srgb,rgb(var(--secondary))_78%,transparent)] px-4 py-2 text-sm font-medium text-[rgb(var(--foreground))] transition-colors hover:border-[rgb(var(--ring))] hover:bg-[rgb(var(--accent))]"
          >
            Cancel command
          </button>
        </div>
      </div>
    </div>
  );
}
