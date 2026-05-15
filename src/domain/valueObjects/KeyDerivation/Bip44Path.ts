import {
    ASI_COIN_TYPE,
    DEFAULT_BIP_44_PATH_OPTIONS,
} from "../../constants";

export interface Bip44PathOptions {
    coinType?: number;
    account?: number;
    change?: number;
    index?: number;
}

export class Bip44Path {
    private constructor(private readonly value: string) {}

    public static fromOptions({
        coinType = ASI_COIN_TYPE,
        account = DEFAULT_BIP_44_PATH_OPTIONS.account,
        change = DEFAULT_BIP_44_PATH_OPTIONS.change,
        index = DEFAULT_BIP_44_PATH_OPTIONS.index,
    }: Bip44PathOptions = DEFAULT_BIP_44_PATH_OPTIONS): Bip44Path {
        return new Bip44Path(
            `m/44'/${coinType}'/${account}'/${change}/${index}`,
        );
    }

    public static build(
        options: Bip44PathOptions = DEFAULT_BIP_44_PATH_OPTIONS,
    ): string {
        return Bip44Path.fromOptions(options).toString();
    }

    public toString(): string {
        return this.value;
    }
}
