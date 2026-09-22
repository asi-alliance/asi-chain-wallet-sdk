export interface IClosable {
    isActive(): boolean;
    close(): void;
}

export interface IAsyncClosable {
    isActive(): boolean;
    close(): Promise<void>;
}

export default abstract class ClosableDomain implements IAsyncClosable {
    private active: boolean;

    constructor() {
        this.active = true;
    }

    public isActive(): boolean {
        return this.active;
    }

    public async close(): Promise<void> {
        if (!this.active) {
            return;
        }

        this.active = false;

        await this.onClose();
    }

    protected abstract onClose(): Promise<void>;
}