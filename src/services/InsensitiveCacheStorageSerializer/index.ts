import Account from "@domains/Account";
import { IInsensitiveCacheRecord } from "@domains/InsensitiveCacheStorageRepository";
import { encodeBase16 } from "@utils/codec";

export default class InsensitiveCacheStorageSerializer {
    public static serialize = (account: Account): IInsensitiveCacheRecord => {
        return {
            id: account.getId(),
            address: account.getAddress(),
            publicKey: encodeBase16(account.getPublicKey()),
        };
    };
}
