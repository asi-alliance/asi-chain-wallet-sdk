import {
    INetworkConfig,
    INetworkRecord,
    INetworkUpdate,
    NetworkName,
} from "@domains/Network";
import {
    ensureValid,
    generateRandomId,
    validateNetworkConfigUrls,
    validateNodeApiProfile,
} from "@utils/index";

export interface ICreateNetworkRecordPayload {
    name: NetworkName;
    config: INetworkConfig;
}

export interface IUpdateNetworkRecordPayload {
    record: INetworkRecord;
    update: INetworkUpdate;
}

export const createNetworkRecord = ({
    name,
    config,
}: ICreateNetworkRecordPayload): INetworkRecord => {
    ensureValid(validateNetworkConfigUrls(config, { allowEmpty: false }), {
        context: "createNetworkRecord",
    });
    ensureValid(validateNodeApiProfile(config.nodeApiProfile), {
        context: "createNetworkRecord",
    });

    return {
        id: generateRandomId(),
        name,
        config,
        isDefault: false,
    };
};

export const createUpdatedNetworkRecord = ({
    record,
    update,
}: IUpdateNetworkRecordPayload): INetworkRecord => {
    if (record.isDefault) {
        throw new Error("Network config is not default");
    }

    if (update.config) {
        ensureValid(
            validateNetworkConfigUrls(update.config, { allowEmpty: false }),
            { context: "createUpdatedNetworkRecord" },
        );
    }

    if (update.config && update.config.nodeApiProfile !== undefined) {
        ensureValid(validateNodeApiProfile(update.config.nodeApiProfile), {
            context: "createUpdatedNetworkRecord",
        });
    }

    const { nodeApiProfile, ...endpoints }: Partial<INetworkConfig> =
        update.config ?? {};

    return {
        ...record,
        name: update.name ?? record.name,
        config: {
            ...record.config,
            ...endpoints,
            nodeApiProfile: nodeApiProfile ?? record.config.nodeApiProfile,
        },
    };
};
