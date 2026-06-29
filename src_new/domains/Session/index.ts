import { NetworkName } from "@domains/Network";

export type ISessionState = {
    activeAccountId: string | null;
    networkId: NetworkName;
};

export class Session {
    private activeAccountId: string | null;
    private networkId: NetworkName;

    constructor(state: ISessionState) {
        this.activeAccountId = state.activeAccountId;
        this.networkId = state.networkId;
    }

    public selectAccount(accountId: string | null): void {
        this.activeAccountId = accountId;
    }

    public selectNetwork(networkId: NetworkName): void {
        this.networkId = networkId;
    }

    public getActiveAccountId(): string | null {
        return this.activeAccountId;
    }

    public getNetworkId(): NetworkName {
        return this.networkId;
    }

    public getSession(): ISessionState {
        return {
            activeAccountId: this.activeAccountId,
            networkId: this.networkId,
        };
    }
}
