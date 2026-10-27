import "fake-indexeddb/auto";

import test from "node:test";
import assert from "node:assert/strict";


import { runStorageContract } from "./storage.contract";
import BrowserStorage from "@domains/BrowserStorage";

const createBrowserStorage = (): BrowserStorage =>
    new BrowserStorage(`test-browser-storage-${Date.now()}-${Math.random()}`);

runStorageContract(test, createBrowserStorage);

test("concurrent init calls share one database connection", async () => {
    const storage = createBrowserStorage();

    const [first, second] = await Promise.all([storage.init(), storage.init()]);

    assert.equal(first, second);
});
