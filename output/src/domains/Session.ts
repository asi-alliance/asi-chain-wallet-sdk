export interface SessionState {
    readonly activeAccountId: string | null;
    readonly updatedAt: number;
}

export class Session {
    public readonly activeAccountId: string | null;
    public readonly updatedAt: number;

    constructor(state: SessionState) {
        this.activeAccountId = state.activeAccountId;
        this.updatedAt = state.updatedAt;
    }

    public withActiveAccount(accountId: string | null): Session {
        return new Session({
            activeAccountId: accountId,
            updatedAt: Date.now(),
        });
    }
}
