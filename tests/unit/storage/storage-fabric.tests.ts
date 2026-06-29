import test from "node:test";
import assert from "node:assert/strict";

import { storageFabric } from "@fabrics/Storage";
import NodeStorage from "../../../scenarios/src/domains/NodeStorage";
import BrowserStorage from "../../../scenarios/src/domains/BrowserStorage";

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
