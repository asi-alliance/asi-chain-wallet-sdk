import { Session, SessionState } from "../domains/Session";
import { StorageService } from "./StorageService";

export class SessionService {
    constructor(private readonly storage: StorageService) {}

    public async getSession(): Promise<Session> {
        const record = await this.storage.getSession();
        if (record) {
            return new Session(record);
        }
        return new Session({
            activeAccountId: null,
            updatedAt: Date.now(),
        });
    }

    public async setActiveAccount(accountId: string | null): Promise<Session> {
        const state: SessionState = {
            activeAccountId: accountId,
            updatedAt: Date.now(),
        };

        await this.storage.saveSession(state);
        return new Session(state);
    }

    public async clearSession(): Promise<Session> {
        await this.storage.clearSession();
        return new Session({
            activeAccountId: null,
            updatedAt: Date.now(),
        });
    }
}
