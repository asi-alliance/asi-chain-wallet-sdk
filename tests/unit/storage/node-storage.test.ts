import test from "node:test";
import path from "node:path";

import NodeStorage from "@domains/NodeStorage";

import { runStorageContract } from "./storage.contract";

runStorageContract(
    test,
    () =>
        new NodeStorage(path.join(process.cwd(), ".tmp", crypto.randomUUID())),
);
