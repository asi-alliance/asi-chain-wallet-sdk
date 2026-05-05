type UiCallback =  {
  (): void | Promise<void>;
} | null;

export interface IUiEventDispatcher {
  onVaultChanged: UiCallback;
}