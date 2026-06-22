import "fake-indexeddb/auto";

import test from "node:test";

import BrowserStorage from "@domains/BrowserStorage";

import { runStorageContract } from "./storage.contract";

runStorageContract(
    test,
    () =>
        new BrowserStorage(
            `test-browser-storage-${Date.now()}-${Math.random()}`,
        ),
);
