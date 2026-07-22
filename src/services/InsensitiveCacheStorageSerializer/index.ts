import Account from "@domains/Account";
import { IInsensitiveCacheRecord } from "@domains/InsensitiveCacheStorageRepository";

export default class InsensitiveCacheStorageSerializer {
    public static serialize = (account: Account): IInsensitiveCacheRecord => {
        return {
            id: account.getId(),
            address: account.getAddress(),
        };
    };
}
