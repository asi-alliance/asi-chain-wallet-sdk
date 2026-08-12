export default abstract class ClosableDomain {
    private active: boolean;

    constructor() {
        this.active = true;
    }

    public isActive(): boolean {
        return this.active;
    }

    public close(): void {
        if (!this.active) {
            return;
        }

        this.active = false;

        this.onClose();
    }

    protected abstract onClose(): void;
}