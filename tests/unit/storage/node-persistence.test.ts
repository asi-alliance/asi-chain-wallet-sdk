import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import NodeStorage from "../../../scenarios/src/domains/NodeStorage";

test("NodeStorage persists data between instances", async () => {
    const dir = path.join(process.cwd(), ".persist-test");

    const storage1 = new NodeStorage(dir);

    await storage1.createTable("users", "id");

    await storage1.insert("users", {
        id: "1",
        name: "Ivan",
    });

    await storage1.close();

    const storage2 = new NodeStorage(dir);

    const record = await storage2.getById("users", "1");

    assert.equal(record?.name, "Ivan");
});
