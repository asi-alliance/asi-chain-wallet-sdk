import "fake-indexeddb/auto";

import test from "node:test";


import { runStorageContract } from "./storage.contract";
import BrowserStorage from "@domains/BrowserStorage";

runStorageContract(
    test,
    () =>
        new BrowserStorage(
            `test-browser-storage-${Date.now()}-${Math.random()}`,
        ),
);
