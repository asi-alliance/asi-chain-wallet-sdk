import { NATIVE_TOKEN_DECIMALS_AMOUNT } from "@config/index";
import type { INetworkConfig } from "@domains/Network";

// Matches the native-token precision supported by the Rust node.
export const MAX_NATIVE_TOKEN_DECIMALS = 18;

export const isNativeTokenDecimals = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) &&
    value >= 0 && value <= MAX_NATIVE_TOKEN_DECIMALS;

export const getNativeTokenDecimals = (
    config: Pick<INetworkConfig, "nativeTokenDecimals">,
): number => {
    if (!("nativeTokenDecimals" in config)) {
        return NATIVE_TOKEN_DECIMALS_AMOUNT;
    }
    const value = config.nativeTokenDecimals;
    if (!Object.prototype.hasOwnProperty.call(config, "nativeTokenDecimals") ||
        !isNativeTokenDecimals(value)) {
        throw new RangeError("nativeTokenDecimals must be an integer from 0 to 18");
    }
    return value;
};

export const snapshotNetworkConfig = <T extends Partial<INetworkConfig>>(config: T): T => {
    if ("nativeTokenDecimals" in config &&
        !Object.prototype.hasOwnProperty.call(config, "nativeTokenDecimals")) {
        throw new RangeError("nativeTokenDecimals must be an own configuration field");
    }
    const snapshot = { ...config };
    getNativeTokenDecimals(snapshot);
    return Object.freeze(snapshot);
};
