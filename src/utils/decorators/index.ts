import { ICreateClientFlags } from "@domains/Client";
import { WalletTypes } from "@domains/Signer";
import { ITableRecord, ITableService } from "@domains/TableService";
import {
    AccountBusyError,
    DomainClosedError,
    HDWalletOnlyOperationError,
} from "@domains/CustomError";
import LifecycleGuard from "@domains/LifecycleGuard";
import ConcurrentOperationGuardService from "@services/ConcurrentOperationGuard";

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
    getType(): WalletTypes;
}

export function OnlyHDWallet<
    This extends IWalletContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (this.getType() !== WalletTypes.HD) {
            throw new HDWalletOnlyOperationError(String(context.name));
        }

        return target.apply(this, args);
    };
}

interface IAccountOperationsContext {
    getId(): string;
    accountOperationsGuard: ConcurrentOperationGuardService<string>;
}

export function EnsureAccountIsIdle<
    This extends IAccountOperationsContext,
    Args extends [string, ...any[]],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        const [accountId] = args;

        if (this.accountOperationsGuard.hasScopeHolders(accountId)) {
            throw new AccountBusyError(this.getId(), accountId);
        }

        return target.apply(this, args);
    };
}

export interface IClosableContext {
    isActive(): boolean;
}

export function EnsureActive<
    This extends IClosableContext,
    Args extends any[],
    Return,
>(target: (...args: Args) => Return, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): Return {
        if (!this.isActive()) {
            throw new DomainClosedError(this.constructor.name);
        }

        return target.apply(this, args);
    };
}

export function SkipWhenInactive<
    This extends IClosableContext,
    Args extends any[],
>(target: (...args: Args) => void, _context: ClassMethodDecoratorContext) {
    return function (this: This, ...args: Args): void {
        if (!this.isActive()) {
            return;
        }

        target.apply(this, args);
    };
}

export interface ITrackedOperationContext {
    lifecycleGuard: LifecycleGuard;
}

export function TrackOperation<
    This extends ITrackedOperationContext,
    Args extends any[],
    Return,
>(
    target: (...args: Args) => Promise<Return>,
    _context: ClassMethodDecoratorContext,
) {
    return function (this: This, ...args: Args): Promise<Return> {
        return this.lifecycleGuard.track(() => target.apply(this, args));
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
