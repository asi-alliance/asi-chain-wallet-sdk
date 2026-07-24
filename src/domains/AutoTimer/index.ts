export interface IAutoTimerOptions {
    delayMs: number;
    onElapsed: () => void;
}

export default class AutoTimer {
    private readonly delayMs: number;
    private readonly onElapsed: () => void;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor({ delayMs, onElapsed }: IAutoTimerOptions) {
        this.delayMs = delayMs;
        this.onElapsed = onElapsed;
    }

    public isActive(): boolean {
        return this.timer !== null;
    }

    public start(): void {
        this.clear();

        if (this.delayMs <= 0) {
            return;
        }

        this.timer = setTimeout(() => {
            this.timer = null;

            this.onElapsed();
        }, this.delayMs);
    }

    public clear(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}