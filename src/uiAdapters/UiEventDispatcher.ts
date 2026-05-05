import { IUiEventDispatcher } from "../application/ports/outbound/IUiEventDispatcher";

/**
 * A bridge between the SDK and UI. Allows you to react to updates in the SDK state. To transition from OOP to reactive data, try to use it only at one point: within sdk-react-kit.
 */
export class UiEventDispatcher implements IUiEventDispatcher {
  public onVaultChanged = null;
  public onLocalTxHistoryChanged = null;

}