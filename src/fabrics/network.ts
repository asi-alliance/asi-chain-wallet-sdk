import { NATIVE_TOKEN_DECIMALS_AMOUNT } from "@config/index";
import {
    INetworkConfig,
    INetworkRecord,
    INetworkUpdate,
    IResolvedNetworkConfig,
    NetworkName,
} from "@domains/Network";
import {
    ensureValid,
    generateRandomId,
    validateNativeTokenDecimals,
    validateNetworkConfigUrls,
    validateNetworkUniqueness,
    validateNodeApiProfile,
} from "@utils/index";

export interface ICreateNetworkRecordPayload {
    name: NetworkName;
    config: INetworkConfig;
    networks: INetworkRecord[];
}

export interface IUpdateNetworkRecordPayload {
    record: INetworkRecord;
    update: INetworkUpdate;
    networks: INetworkRecord[];
}

const otherNetworks = (
    networks: INetworkRecord[],
    id?: INetworkRecord["id"],
): INetworkRecord[] =>
    networks.filter((record: INetworkRecord) => record.id !== id);

export const createNetworkConfigSnapshot = (
    config: INetworkConfig,
): IResolvedNetworkConfig =>
    Object.freeze({
        ...config,
        // TODO: drop the 8-decimal fallback once Dev and DevNet both run the
        // Rust node with 18 decimals and every network config sets
        // nativeTokenDecimals explicitly.
        nativeTokenDecimals:
            config.nativeTokenDecimals ?? NATIVE_TOKEN_DECIMALS_AMOUNT,
    });

export const createNetworkRecord = ({
    name,
    config,
    networks,
}: ICreateNetworkRecordPayload): INetworkRecord => {
    ensureValid(validateNetworkConfigUrls(config, { allowEmpty: false }), {
        context: "createNetworkRecord",
    });
    ensureValid(validateNodeApiProfile(config.nodeApiProfile), {
        context: "createNetworkRecord",
    });
    ensureValid(validateNativeTokenDecimals(config.nativeTokenDecimals), {
        context: "createNetworkRecord",
    });

    const snapshot: IResolvedNetworkConfig = createNetworkConfigSnapshot(config);

    ensureValid(validateNetworkUniqueness(name, snapshot, networks), {
        context: "createNetworkRecord",
    });

    return {
        id: generateRandomId(),
        name,
        config: snapshot,
        isDefault: false,
    };
};

export const createUpdatedNetworkRecord = ({
    record,
    update,
    networks,
}: IUpdateNetworkRecordPayload): INetworkRecord => {
    if (record.isDefault) {
        throw new Error("Network config is not default");
    }

    if (update.config) {
        ensureValid(
            validateNetworkConfigUrls(update.config, { allowEmpty: false }),
            { context: "createUpdatedNetworkRecord" },
        );
        ensureValid(
            validateNativeTokenDecimals(update.config.nativeTokenDecimals),
            { context: "createUpdatedNetworkRecord" },
        );
    }

    if (update.config && update.config.nodeApiProfile !== undefined) {
        ensureValid(validateNodeApiProfile(update.config.nodeApiProfile), {
            context: "createUpdatedNetworkRecord",
        });
    }

    const name: NetworkName = update.name ?? record.name;

    const config: IResolvedNetworkConfig = update.config
        ? createNetworkConfigSnapshot({
              ...record.config,
              ...update.config,
              nodeApiProfile:
                  update.config.nodeApiProfile ?? record.config.nodeApiProfile,
              nativeTokenDecimals:
                  update.config.nativeTokenDecimals ??
                  record.config.nativeTokenDecimals,
          })
        : record.config;

    ensureValid(
        validateNetworkUniqueness(
            name,
            config,
            otherNetworks(networks, record.id),
        ),
        { context: "createUpdatedNetworkRecord" },
    );

    return { ...record, name, config };
};
