import Wallet from "@domains/Wallet";
import BinaryWriter from "@domains/BinaryWriter";
import { DeployData } from "@domains/Deploy";
import { bigIntToBuffer } from "@utils/codec";
import { isUint256 } from "@utils/guards";

export interface SigningRequest {
    wallet: Wallet;
    data: any;
}

export interface SignedResult {
    // TODO(next-major): Type data as DeployData; narrowing it from any breaks
    // consumers that read fields outside DeployData or treat phloPrice as a number.
    data: any;
    deployer: string;
    signature: string;
    sigAlgorithm: string;
}

const DEPLOY_TERM_FIELD: number = 2;
const DEPLOY_TIMESTAMP_FIELD: number = 3;
const DEPLOY_CLASSIC_PHLO_PRICE_FIELD: number = 7;
const DEPLOY_PHLO_LIMIT_FIELD: number = 8;
const DEPLOY_VALID_AFTER_BLOCK_NUMBER_FIELD: number = 10;
const DEPLOY_SHARD_ID_FIELD: number = 11;
const DEPLOY_UINT256_PHLO_PRICE_FIELD: number = 15;

const writeDeployHeader = (
    writer: BinaryWriter,
    { term, timestamp }: DeployData,
): void => {
    writer.writeString(DEPLOY_TERM_FIELD, term);
    writer.writeInt64(DEPLOY_TIMESTAMP_FIELD, timestamp);
};

const writeDeployBody = (
    writer: BinaryWriter,
    { phloLimit, validAfterBlockNumber, shardId = "" }: DeployData,
): void => {
    writer.writeInt64(DEPLOY_PHLO_LIMIT_FIELD, phloLimit);
    writer.writeInt64(
        DEPLOY_VALID_AFTER_BLOCK_NUMBER_FIELD,
        validAfterBlockNumber,
    );
    writer.writeString(DEPLOY_SHARD_ID_FIELD, shardId);
};

export default class SignerService {
    public static readonly deployDataProtobufSerialize = (
        deployData: DeployData,
    ): Uint8Array => {
        const writer: BinaryWriter = new BinaryWriter();

        writeDeployHeader(writer, deployData);
        writer.writeInt64(
            DEPLOY_CLASSIC_PHLO_PRICE_FIELD,
            Number(deployData.phloPrice),
        );
        writeDeployBody(writer, deployData);

        return writer.getResultBuffer();
    };

    public static readonly deployDataUint256ProtobufSerialize = (
        deployData: DeployData,
    ): Uint8Array => {
        const { phloPrice }: Pick<DeployData, "phloPrice"> = deployData;

        if (!isUint256(phloPrice)) {
            throw new RangeError(
                "Phlo price field must be an unsigned 256-bit integer",
            );
        }

        const writer: BinaryWriter = new BinaryWriter();

        writeDeployHeader(writer, deployData);
        writeDeployBody(writer, deployData);
        writer.writeBytes(
            DEPLOY_UINT256_PHLO_PRICE_FIELD,
            bigIntToBuffer(BigInt(phloPrice)),
        );

        return writer.getResultBuffer();
    };
}
