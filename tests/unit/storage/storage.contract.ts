import { TestContext } from "node:test";
import assert from "node:assert/strict";
import {
    ITableRecord,
    ITableService,
} from "../../../scenarios/src/domains/TableService";

export type StorageFactory = () => ITableService<ITableRecord>;

export const runStorageContract = (
    test: TestContext["test"],
    createStorage: StorageFactory,
): void => {
    test("create table", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        assert.equal(await storage.tableExists("users"), true);
    });

    test("insert and get by id", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insert("users", {
            id: "1",
            name: "Ivan",
        });

        const record = await storage.getById("users", "1");

        assert.ok(record);
        assert.equal(record.id, "1");
        assert.equal(record.name, "Ivan");
    });

    test("insert many", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insertMany("users", [
            { id: "1" },
            { id: "2" },
            { id: "3" },
        ]);

        const records = await storage.getAll("users");

        assert.equal(records.length, 3);
    });

    test("update", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insert("users", {
            id: "1",
            name: "Ivan",
        });

        await storage.update("users", "1", {
            name: "Alex",
        });

        const record = await storage.getById("users", "1");

        assert.equal(record?.name, "Alex");
    });

    test("delete", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insert("users", {
            id: "1",
        });

        await storage.delete("users", "1");

        const record = await storage.getById("users", "1");

        assert.equal(record, null);
    });

    test("delete many", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insertMany("users", [
            { id: "1" },
            { id: "2" },
            { id: "3" },
        ]);

        await storage.deleteMany("users", ["1", "2"]);

        const records = await storage.getAll("users");

        assert.equal(records.length, 1);
        assert.equal(records[0].id, "3");
    });

    test("clear table", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insertMany("users", [{ id: "1" }, { id: "2" }]);

        await storage.clearTable("users");

        const records = await storage.getAll("users");

        assert.equal(records.length, 0);
    });

    test("drop table", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.dropTable("users");

        assert.equal(await storage.tableExists("users"), false);
    });

    test("missing record returns null", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        const record = await storage.getById("users", "unknown");

        assert.equal(record, null);
    });

    test("update missing record throws", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await assert.rejects(() => storage.update("users", "unknown", {}));
    });

    test("unknown table throws", async () => {
        const storage = createStorage();

        await assert.rejects(() => storage.getAll("unknown"));
    });
};
