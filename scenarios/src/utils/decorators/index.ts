import { ITableRecord, ITableService } from "@domains/TableService";

export function EnsureDatabaseInitialized<
    This extends ITableService<ITableRecord>,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return async function (
        this: This,
        ...args: Args
    ): Promise<Awaited<Return>> {
        await this.init();

        return await target.apply(this, args);
    };
}

export function EnsureTableExists<
    This extends ITableService<ITableRecord>,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return async function (
        this: This,
        ...args: Args
    ): Promise<Awaited<Return>> {
        const tableName = args[0];

        if (typeof tableName !== "string") {
            throw new Error(
                `Table name must be a string and should be the first argument of the method. Received: ${typeof args[0]}`,
            );
        }

        if (!(await this.tableExists(tableName))) {
            throw new Error(
                `Table '${tableName}' does not exist. Use createTable() first.`,
            );
        }

        return await target.apply(this, args);
    };
}

export function SkipIfDatabaseNotInitialized<
    This extends ITableService<ITableRecord>,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return async function (
        this: This,
        ...args: Args
    ): Promise<Awaited<Return> | undefined> {
        if (!this.isInitialized()) {
            return;
        }

        return await target.apply(this, args);
    };
}

export function SkipIfTableExists<
    This extends ITableService<ITableRecord>,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return async function (
        this: This,
        ...args: Args
    ): Promise<Awaited<Return> | undefined> {
        const tableName = args[0];

        if (typeof tableName !== "string") {
            throw new Error(
                `Table name must be a string and should be the first argument of the method. Received: ${typeof args[0]}`,
            );
        }

        if (!!(await this.tableExists(tableName))) {
            return;
        }

        return await target.apply(this, args);
    };
}
