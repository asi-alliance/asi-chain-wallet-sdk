import { ModuleRegistry } from "./ModuleRegistry";
import { NetworkModule } from "./NetworkModule";

export class NetworkResolver {
    constructor(private readonly registry: ModuleRegistry<NetworkModule>) {}

    public resolve(networkId: string): NetworkModule {
        return this.registry.resolve(networkId);
    }

    public has(networkId: string): boolean {
        return this.registry.has(networkId);
    }

    public listNetworks(): ReadonlyArray<NetworkModule> {
        return this.registry.list();
    }
}
