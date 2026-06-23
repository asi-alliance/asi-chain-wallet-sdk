export class ModuleRegistry<T extends { readonly id: string }> {
    private readonly modules = new Map<string, T>();

    public register(module: T): void {
        if (this.modules.has(module.id)) {
            throw new Error(`Module with id '${module.id}' is already registered.`);
        }

        this.modules.set(module.id, module);
    }

    public resolve(id: string): T {
        const module = this.modules.get(id);
        if (!module) {
            throw new Error(`Module with id '${id}' is not registered.`);
        }
        return module;
    }

    public list(): ReadonlyArray<T> {
        return Array.from(this.modules.values());
    }

    public has(id: string): boolean {
        return this.modules.has(id);
    }
}
