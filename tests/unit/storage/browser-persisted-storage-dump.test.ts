import "fake-indexeddb/auto";

import test from "node:test";

import { runPersistedStorageDumpContract } from "./persisted-storage-dump.contract";

Object.defineProperty(globalThis, "window", {
    value: globalThis,
    configurable: true,
});

runPersistedStorageDumpContract(test, {});
