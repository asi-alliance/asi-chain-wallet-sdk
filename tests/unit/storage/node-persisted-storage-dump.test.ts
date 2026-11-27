import test from "node:test";

import { runPersistedStorageDumpContract } from "./persisted-storage-dump.contract";

runPersistedStorageDumpContract(test, {
    nodeStorageDir: ".tmp/persisted-storage-dump",
});
