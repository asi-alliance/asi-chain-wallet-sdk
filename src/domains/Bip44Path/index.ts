import { DIGITS_ONLY_REGEX } from "@utils/constants";

export interface IBip44PathOptions {
    coinType: number;
    account?: number;
    change?: number;
    index?: number;
}

export default class Bip44Path {
    private static readonly BIP44_PURPOSE: number = 44;
    private static readonly HARDENED_SUFFIX: string = "'";
    private static readonly MIN_CHANGE: number = 0;
    private static readonly MAX_CHANGE: number = 1;
    private static readonly PATH_COMPONENTS_COUNT: number = 6;
    private static readonly PURPOSE_INDEX: number = 1;
    private static readonly COIN_TYPE_INDEX: number = 2;
    private static readonly ACCOUNT_INDEX: number = 3;
    private static readonly CHANGE_INDEX: number = 4;
    private static readonly INDEX_COMPONENT_INDEX: number = 5;
    private static readonly DECIMAL_RADIX: number = 10;

    private coinType: number;
    private account: number;
    private change: number;
    private index: number;

    constructor({
        coinType,
        account = 0,
        change = 0,
        index = 0,
    }: IBip44PathOptions) {
        if (coinType < 0) {
            throw new Error("coinType must be non-negative");
        }

        if (account < 0) {
            throw new Error("account must be non-negative");
        }

        if (change < Bip44Path.MIN_CHANGE || change > Bip44Path.MAX_CHANGE) {
            throw new Error("change must be 0 or 1");
        }

        if (index < 0) {
            throw new Error("index must be non-negative");
        }

        this.coinType = coinType;
        this.account = account;
        this.change = change;
        this.index = index;
    }

    public static parse(pathString: string): Bip44Path {
        const parts: string[] = pathString.split("/");

        if (parts[0] !== "m") {
            throw new Error("Path must start with 'm'");
        }

        if (parts.length !== Bip44Path.PATH_COMPONENTS_COUNT) {
            throw new Error(
                "Invalid BIP-44 path: expected 6 components (m/44'/coinType'/account'/change/index)",
            );
        }

        if (
            parts[Bip44Path.PURPOSE_INDEX] !==
            `${Bip44Path.BIP44_PURPOSE}${Bip44Path.HARDENED_SUFFIX}`
        ) {
            throw new Error("BIP-44 path must use 44' as the purpose");
        }

        const hardenedCoinTypePart: string = parts[Bip44Path.COIN_TYPE_INDEX];
        const hardenedAccountPart: string = parts[Bip44Path.ACCOUNT_INDEX];
        const changePart: string = parts[Bip44Path.CHANGE_INDEX];
        const indexPart: string = parts[Bip44Path.INDEX_COMPONENT_INDEX];

        if (
            !hardenedCoinTypePart.endsWith(Bip44Path.HARDENED_SUFFIX) ||
            !hardenedAccountPart.endsWith(Bip44Path.HARDENED_SUFFIX)
        ) {
            throw new Error(
                "Invalid BIP-44 path: coinType and account must be hardened",
            );
        }

        const coinTypePart: string = hardenedCoinTypePart.slice(0, -1);
        const accountPart: string = hardenedAccountPart.slice(0, -1);

        if (
            !DIGITS_ONLY_REGEX.test(coinTypePart) ||
            !DIGITS_ONLY_REGEX.test(accountPart) ||
            !DIGITS_ONLY_REGEX.test(changePart) ||
            !DIGITS_ONLY_REGEX.test(indexPart)
        ) {
            throw new Error(
                "Invalid BIP-44 path: path components must be numbers",
            );
        }

        return new Bip44Path({
            coinType: parseInt(coinTypePart, Bip44Path.DECIMAL_RADIX),
            account: parseInt(accountPart, Bip44Path.DECIMAL_RADIX),
            change: parseInt(changePart, Bip44Path.DECIMAL_RADIX),
            index: parseInt(indexPart, Bip44Path.DECIMAL_RADIX),
        });
    }

    public static isValid(pathString: string): boolean {
        try {
            Bip44Path.parse(pathString);

            return true;
        } catch {
            return false;
        }
    }

    public toString(): string {
        return `m/44'/${this.coinType}'/${this.account}'/${this.change}/${this.index}`;
    }

    public getCoinType(): number {
        return this.coinType;
    }

    public getAccount(): number {
        return this.account;
    }

    public getChange(): number {
        return this.change;
    }

    public getIndex(): number {
        return this.index;
    }

    public setCoinType(value: number): void {
        if (value < 0) {
            throw new Error("coinType must be non-negative");
        }
        this.coinType = value;
    }

    public setAccount(value: number): void {
        if (value < 0) {
            throw new Error("account must be non-negative");
        }

        this.account = value;
    }

    public setChange(value: number): void {
        if (value < Bip44Path.MIN_CHANGE || value > Bip44Path.MAX_CHANGE) {
            throw new Error("change must be 0 or 1");
        }

        this.change = value;
    }

    public setIndex(value: number): void {
        if (value < 0) {
            throw new Error("index must be non-negative");
        }

        this.index = value;
    }

    public static fromOptions(options: IBip44PathOptions): Bip44Path {
        return new Bip44Path({
            coinType: options.coinType,
            account: options.account ?? 0,
            change: options.change ?? 0,
            index: options.index ?? 0,
        });
    }

    public toOptions(): IBip44PathOptions {
        return {
            coinType: this.coinType,
            account: this.account,
            change: this.change,
            index: this.index,
        };
    }

    public clone(): Bip44Path {
        return new Bip44Path({
            coinType: this.coinType,
            account: this.account,
            change: this.change,
            index: this.index,
        });
    }

    public nextIndex(): Bip44Path {
        return new Bip44Path({
            coinType: this.coinType,
            account: this.account,
            change: this.change,
            index: this.index + 1,
        });
    }

    // public static replaceBip44Index(
    //     path: string | Bip44Path,
    //     index: number,
    // ): Bip44Path {
    //     const bip44Path: Bip44Path =
    //         typeof path === "string" ? Bip44Path.parse(path) : path.clone();
    //     bip44Path.setIndex(index);
    //     return bip44Path;
    // }
}
