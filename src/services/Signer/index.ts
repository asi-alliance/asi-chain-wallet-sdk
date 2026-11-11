import Wallet from "@domains/Wallet";
import BinaryWriter from "@domains/BinaryWriter";
import { DeployData } from "@domains/Deploy";
import { NodeApiProfile } from "@domains/NodeApiProfile";
import { encodeTokenAmount, resolveDeployPhlo } from "@utils/monetary";

export interface SigningRequest {
    wallet: Wallet;
    data: any;
}

export interface SignedResult {
    data: DeployData;
    deployer: string;
    signature: string;
    sigAlgorithm: string;
    nodeApiProfile?: NodeApiProfile;
}

export default class SignerService {
    public static readonly deployDataProtobufSerialize = (
        deployData: DeployData,
        profile: NodeApiProfile = NodeApiProfile.SCALA,
    ): Uint8Array => {
        const {
            term,
            timestamp,
            phloPrice,
            phloLimit,
            validAfterBlockNumber,
            shardId = "",
        } = deployData;

        const phlo = resolveDeployPhlo(deployData, profile);
        if (typeof term !== "string" || !term.trim() ||
            typeof shardId !== "string" || !shardId.trim() ||
            !Number.isSafeInteger(timestamp) || timestamp <= 0 ||
            !Number.isSafeInteger(validAfterBlockNumber) || validAfterBlockNumber < -1) {
            throw new RangeError("Invalid deploy signing fields");
        }
        if (profile === NodeApiProfile.RUST &&
            Object.keys(deployData).some(key => ![
                "term", "timestamp", "phloPrice", "phloLimit", "validAfterBlockNumber", "shardId",
            ].includes(key))) {
            throw new Error("Unsupported uint256 deploy signing field");
        }

        const writer = new BinaryWriter();

        writer.writeString(2, term);
        writer.writeInt64(3, timestamp);
        if (profile !== NodeApiProfile.RUST) {
            writer.writeInt64(7, phlo.phloPrice as number);
        }
        writer.writeInt64(8, phloLimit);
        writer.writeInt64(10, validAfterBlockNumber);
        writer.writeString(11, shardId);
        if (profile === NodeApiProfile.RUST) {
            writer.writeBytes(15, encodeTokenAmount(phloPrice));
        }

        return writer.getResultBuffer();
    };
}
