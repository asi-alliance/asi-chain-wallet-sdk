import Wallet from "@domains/Wallet";
import BinaryWriter from "@domains/BinaryWriter";
import { DeployData } from "@domains/Deploy";
import { bigIntToBuffer } from "@utils/codec";

export interface SigningRequest {
    wallet: Wallet;
    data: any;
}

export interface SignedResult {
    data: DeployData;
    deployer: string;
    signature: string;
    sigAlgorithm: string;
}

const writeDeployHeader = (
    writer: BinaryWriter,
    { term, timestamp }: DeployData,
): void => {
    writer.writeString(2, term);
    writer.writeInt64(3, timestamp);
};

const writeDeployBody = (
    writer: BinaryWriter,
    { phloLimit, validAfterBlockNumber, shardId = "" }: DeployData,
): void => {
    writer.writeInt64(8, phloLimit);
    writer.writeInt64(10, validAfterBlockNumber);
    writer.writeString(11, shardId);
};

export default class SignerService {
    public static readonly deployDataProtobufSerialize = (
        deployData: DeployData,
    ): Uint8Array => {
        const writer = new BinaryWriter();

        writeDeployHeader(writer, deployData);
        writer.writeInt64(7, Number(deployData.phloPrice));
        writeDeployBody(writer, deployData);

        return writer.getResultBuffer();
    };

    public static readonly deployDataUint256ProtobufSerialize = (
        deployData: DeployData,
    ): Uint8Array => {
        const writer = new BinaryWriter();

        writeDeployHeader(writer, deployData);
        writeDeployBody(writer, deployData);
        writer.writeBytes(15, bigIntToBuffer(BigInt(deployData.phloPrice)));

        return writer.getResultBuffer();
    };
}
