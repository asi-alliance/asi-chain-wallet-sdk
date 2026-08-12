export default class LifecycleGuard {
    private generation: number = 0;

    private isCurrentGeneration(generation: number): boolean {
        return this.generation === generation;
    }

    public invalidate(): void {
        this.generation++;
    }

    public async run<T>(
        operation: () => Promise<T>,
        onInvalidated: (result: T) => Error,
    ): Promise<T> {
        const generation: number = this.generation;

        const result: T = await operation();

        if (this.isCurrentGeneration(generation)) {
            return result;
        }

        throw onInvalidated(result);
    }
}