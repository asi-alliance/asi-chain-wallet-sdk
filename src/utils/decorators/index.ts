import { ICreateClientFlags } from "@domains/Client";
import NetworkConfigProvider from "@domains/NetworkConfigProvider";
import { WalletTypes } from "@domains/Signer";
import { ITableRecord, ITableService } from "@domains/TableService";
import AccountManager from "@services/AccountManager";

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

interface IWalletContext {
    accountManager: AccountManager;
    getType(): WalletTypes;
}

export function OnlyHDWallet<
    This extends IWalletContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return async function (
        this: This,
        ...args: Args
    ): Promise<Awaited<Return>> {
        if (this.getType() !== WalletTypes.HD) {
            throw new Error("This operation is available only for HD wallets");
        }

        return await target.apply(this, args);
    };
}

export function EnsureActiveAccountExist<
    This extends IWalletContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.accountManager.getActiveAccount()) {
            throw new Error("Wallet hasn't active account for transfer!");
        }

        return target.apply(this, args);
    };
}

export interface IClientContext {
    flags?: ICreateClientFlags;
}

export function EnsureWithInsensitiveCacheStorage<
    This extends IClientContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.flags?.withInsensitiveCacheStorage) {
            throw new Error(
                "You cannot get insensitive account data when storage flag inactive!",
            );
        }

        return target.apply(this, args);
    };
}
