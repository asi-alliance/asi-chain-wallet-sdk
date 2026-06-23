export interface AccountProps {
    readonly id: string;
    readonly address: string;
    readonly signerId: string;
    readonly networkId: string;
    readonly metadata?: Record<string, unknown>;
}

export class Account {
    public readonly id: string;
    public readonly address: string;
    public readonly signerId: string;
    public readonly networkId: string;
    public readonly metadata?: Record<string, unknown>;

    private constructor(props: AccountProps) {
        this.id = props.id;
        this.address = props.address;
        this.signerId = props.signerId;
        this.networkId = props.networkId;
        this.metadata = props.metadata;
    }

    public static create(props: AccountProps): Account {
        return new Account(props);
    }
}
