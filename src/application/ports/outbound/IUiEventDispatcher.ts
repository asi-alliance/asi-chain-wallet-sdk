type UiCallback =  {
  (...args: any): void | Promise<void>;
} | null;

export interface IUiEventDispatcher {
  onVaultChanged: UiCallback;
  onLocalTxHistoryChanged: UiCallback;
}