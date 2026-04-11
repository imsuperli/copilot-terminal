import type React from 'react';

export function preventMouseButtonFocus(event: React.MouseEvent<HTMLElement>): void {
  event.preventDefault();
}
