import test from "node:test";
import assert from "node:assert/strict";

import BrowserStorage from "@domains/BrowserStorage";
import NodeStorage from "@domains/NodeStorage";

import { storageFabric } from "@fabrics/Storage";

test("returns NodeStorage in Node", () => {
    delete (globalThis as any).window;

    const storage = storageFabric();

    assert.ok(storage instanceof NodeStorage);
});

test("returns BrowserStorage in browser", () => {
    (globalThis as any).window = {};

    const storage = storageFabric();

    assert.ok(storage instanceof BrowserStorage);
});
