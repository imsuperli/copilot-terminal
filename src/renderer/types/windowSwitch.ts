export interface WindowSwitchOptions {
  exact?: boolean;
}

export type WindowSwitchHandler = (windowId: string, options?: WindowSwitchOptions) => void;
