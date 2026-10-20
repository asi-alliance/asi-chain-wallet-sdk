import { OperationsSuspendedError } from "@domains/CustomError";
import ConcurrentOperationGuardService, {
    OperationScopeMode,
} from "@services/ConcurrentOperationGuard";

export const LIFECYCLE_KEY_PREFIX: string = "LIFECYCLE";
export const SUSPENSION_KEY_PREFIX: string = "SUSPENSION";

export default class LifecycleOperationGuardService extends ConcurrentOperationGuardService {
    private getSuspensionKey(): string {
        return `${LIFECYCLE_KEY_PREFIX}:${SUSPENSION_KEY_PREFIX}`;
    }

    public isSuspended(): boolean {
        return this.hasExclusiveScope(this.getSuspensionKey());
    }

    public runExclusiveAction<T>(operation: () => Promise<T>): Promise<T> {
        const suspensionKey: string = this.getSuspensionKey();

        return this.run(
            new Map(),
            () => new OperationsSuspendedError(),
            operation,
            {
                key: suspensionKey,
                mode: OperationScopeMode.EXCLUSIVE,
                owner: suspensionKey,
            },
        );
    }
}
