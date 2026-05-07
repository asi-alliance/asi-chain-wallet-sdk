import type { Address } from "../aggregates/Wallet";
import { ASI_CHAIN_PREFIX } from "../constants";
import bs58 from "bs58";
import blakejs from "blakejs";
import sha3 from "js-sha3";

const { blake2bHex } = blakejs;
const { keccak256 } = sha3;

const decodeBase16 = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }

    return bytes;
};

export const deriveAddressFromPublicKey = (publicKey: Uint8Array): Address => {
    const hash: string = keccak256(publicKey.slice(1));

    const addressBase: Uint8Array = decodeBase16(hash.slice(-40));

    const addressBaseHash: string = keccak256(addressBase);

    const addressPayload: string = `${ASI_CHAIN_PREFIX.coinId}${ASI_CHAIN_PREFIX.version}${addressBaseHash}`;

    const addressPayloadBytes: Uint8Array = decodeBase16(addressPayload);

    const checksum: string = blake2bHex(
        addressPayloadBytes,
        undefined,
        32,
    ).slice(0, 8);

    return bs58.encode(decodeBase16(`${addressPayload}${checksum}`)) as Address;
};
