import { TestContext } from "node:test";
import assert from "node:assert/strict";
import {
    ITableRecord,
    ITableService,
} from "@domains/TableService";

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

    test("list table names", async () => {
        const storage = createStorage();

        await storage.createTable("users");
        await storage.createTable("accounts");

        const tableNames = await storage.getTableNames();

        assert.deepEqual([...tableNames].sort(), ["accounts", "users"]);
    });

    test("dropped table disappears from the table names", async () => {
        const storage = createStorage();

        await storage.createTable("users");
        await storage.createTable("accounts");

        await storage.dropTable("users");

        assert.deepEqual(await storage.getTableNames(), ["accounts"]);
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

    test("concurrent inserts into one table keep every record", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await Promise.all(
            Array.from({ length: 20 }, (_, index: number) =>
                storage.insert("users", { id: String(index) }),
            ),
        );

        const records = await storage.getAll("users");

        assert.equal(records.length, 20);
    });

    test("concurrent updates of one record keep every change", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insert("users", {
            id: "1",
            name: "Ivan",
            role: "user",
        });

        await Promise.all([
            storage.update("users", "1", { name: "Alex" }),
            storage.update("users", "1", { role: "admin" }),
        ]);

        const record = await storage.getById("users", "1");

        assert.equal(record?.name, "Alex");
        assert.equal(record?.role, "admin");
    });

    test("concurrent table creation creates every table", async () => {
        const storage = createStorage();

        await Promise.all([
            storage.createTable("users"),
            storage.createTable("accounts"),
            storage.createTable("users"),
        ]);

        const tableNames = await storage.getTableNames();

        assert.deepEqual([...tableNames].sort(), ["accounts", "users"]);
    });

    test("concurrent table drops remove every table", async () => {
        const storage = createStorage();

        await storage.createTable("users");
        await storage.createTable("accounts");

        await Promise.all([
            storage.dropTable("users"),
            storage.dropTable("accounts"),
        ]);

        assert.deepEqual(await storage.getTableNames(), []);
    });

    test("operations issued during a schema change succeed", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await Promise.all([
            storage.createTable("accounts"),
            storage.insert("users", { id: "1" }),
            storage.getAll("users"),
            storage.dropTable("accounts"),
            storage.insert("users", { id: "2" }),
        ]);

        assert.equal((await storage.getAll("users")).length, 2);
        assert.deepEqual(await storage.getTableNames(), ["users"]);
    });

    test("update racing a delete does not restore the record", async () => {
        const storage = createStorage();

        await storage.createTable("users");

        await storage.insert("users", {
            id: "1",
            name: "Ivan",
        });

        await Promise.allSettled([
            storage.update("users", "1", { name: "Alex" }),
            storage.delete("users", "1"),
        ]);

        const record = await storage.getById("users", "1");

        assert.equal(record, null);
    });
};
