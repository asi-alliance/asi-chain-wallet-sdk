export interface AssetDefinition {
    readonly id: string;
    readonly symbol: string;
    readonly name: string;
    readonly decimals: number;
    readonly metadata?: Record<string, unknown>;
}

export class Asset {
    public readonly id: string;
    public readonly symbol: string;
    public readonly name: string;
    public readonly decimals: number;
    public readonly metadata?: Record<string, unknown>;

    constructor(definition: AssetDefinition) {
        this.id = definition.id;
        this.symbol = definition.symbol;
        this.name = definition.name;
        this.decimals = definition.decimals;
        this.metadata = definition.metadata;
    }
}
