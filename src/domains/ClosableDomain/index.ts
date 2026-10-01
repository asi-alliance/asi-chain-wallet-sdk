export default abstract class ClosableDomain {
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