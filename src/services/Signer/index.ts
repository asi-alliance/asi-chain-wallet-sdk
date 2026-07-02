import blakejs from "blakejs";
import Wallet from "@domains/Wallet";
import BinaryWriter from "@domains/BinaryWriter";
import { DeployData } from "@domains/Deploy";

export interface SigningRequest {
    wallet: Wallet;
    data: any;
}

export interface SignedResult {
    data: any;
    deployer: string;
    signature: string;
    sigAlgorithm: string;
}

export default class SignerService {
    public static readonly deployDataProtobufSerialize = (
        deployData: DeployData,
    ): Uint8Array => {
        const {
            term,
            timestamp,
            phloPrice,
            phloLimit,
            validAfterBlockNumber,
            shardId = "",
        } = deployData;

        const writer = new BinaryWriter();

        writer.writeString(2, term);
        writer.writeInt64(3, timestamp);
        writer.writeInt64(7, phloPrice);
        writer.writeInt64(8, phloLimit);
        writer.writeInt64(10, validAfterBlockNumber);
        writer.writeString(11, shardId);

        return writer.getResultBuffer();
    };
}
