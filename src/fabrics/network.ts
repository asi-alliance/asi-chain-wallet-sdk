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
    ensureValid(validateNetworkUniqueness(name, config, networks), {
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
    }

    if (update.config && update.config.nodeApiProfile !== undefined) {
        ensureValid(validateNodeApiProfile(update.config.nodeApiProfile), {
            context: "createUpdatedNetworkRecord",
        });
    }

    const name: NetworkName = update.name ?? record.name;

    const config: INetworkConfig = update.config
        ? {
              ...record.config,
              ...update.config,
              nodeApiProfile:
                  update.config.nodeApiProfile ?? record.config.nodeApiProfile,
          }
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
