import ApiWorker from "@domains/ApiWorker";
import { DeployStatus, IDeployStatusResult } from "@domains/Deploy";
import {
    ApiRequestError,
    ApiSource,
    DeployTimeoutError,
    DeployVerdictError,
    UnknownErrorReason,
} from "@domains/CustomError";
import {
    getErrorMessage,
    isDeployVerdictStatus,
    isErrorWithMessage,
    runProtected,
} from "@utils/index";

export interface IDeployConfirmedResult {
    deployId: string;
    blockHash?: string;
}

export interface IDeployWatchCallbacks {
    onConfirmed?: (result: IDeployConfirmedResult) => void;
    onError?: (error: Error) => void;
    onStatus?: (status: IDeployStatusResult, deployId: string) => void;
    onVerdict?: (error: DeployVerdictError) => void;
}

export interface IDeployWatchOptions {
    intervalMs?: number;
    timeoutMs?: number;
}

export interface IDeployWatchHandle {
    cancel: () => void;
    done: Promise<IDeployConfirmedResult>;
}

const DEFAULT_INTERVAL_IN_MILLISECOND: number = 5000;
const DEFAULT_TIMEOUT_IN_MILLISECONDS: number = 180000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export default class DeployStatusPoller extends ApiWorker {
    public watch(
        deployId: string,
        callbacks: IDeployWatchCallbacks = {},
        {
            intervalMs = DEFAULT_INTERVAL_IN_MILLISECOND,
            timeoutMs = DEFAULT_TIMEOUT_IN_MILLISECONDS,
        }: IDeployWatchOptions = {},
    ): IDeployWatchHandle {
        let checking: boolean = false;
        let finished: boolean = false;
        let timer: ReturnType<typeof setInterval>;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let resolveDone!: (result: IDeployConfirmedResult) => void;
        let rejectDone!: (error: Error) => void;

        const done = new Promise<IDeployConfirmedResult>((resolve, reject) => {
            resolveDone = resolve;
            rejectDone = reject;
        });

        const notify = (callback: () => void): void =>
            runProtected(callback, (error: unknown) =>
                console.error(
                    `DeployStatusPoller: watch callback failed for the deploy ${deployId}:`,
                    error,
                ),
            );

        const stop = (): void => {
            if (finished) {
                return;
            }

            finished = true;
            clearInterval(timer);
            clearTimeout(timeout);
        };

        const succeed = (result: IDeployConfirmedResult): void => {
            if (finished) {
                return;
            }

            stop();

            notify(() => callbacks.onConfirmed?.(result));

            resolveDone(result);
        };

        const fail = (error: Error, notifyCause?: () => void): void => {
            if (finished) {
                return;
            }

            stop();

            notify(() => notifyCause?.());
            notify(() => callbacks.onError?.(error));

            rejectDone(error);
        };

        const tick = async (): Promise<void> => {
            if (checking || finished) {
                return;
            }

            checking = true;

            try {
                const status: IDeployStatusResult =
                    await this.getApi().getDeployStatus(deployId);

                if (finished) {
                    return;
                }

                notify(() => callbacks.onStatus?.(status, deployId));

                if (status.status === DeployStatus.FINALIZED) {
                    succeed({ deployId });

                    return;
                }

                if (isDeployVerdictStatus(status.status)) {
                    const verdict: DeployVerdictError = new DeployVerdictError(
                        deployId,
                        status.status,
                        "detail" in status ? status.detail : undefined,
                    );

                    fail(verdict, () => callbacks.onVerdict?.(verdict));

                    return;
                }
            } catch (error: unknown) {
                fail(
                    isErrorWithMessage(error)
                        ? error
                        : new ApiRequestError(
                              ApiSource.NODE,
                              `DeployStatusPoller.watch of the deploy ${deployId}`,
                              getErrorMessage(
                                  error,
                                  UnknownErrorReason.NODE_API,
                              ),
                          ),
                );
            } finally {
                checking = false;
            }
        };

        const deadline = Date.now() + timeoutMs;
        const scheduleTimeout = (): void => {
            const remaining = deadline - Date.now();
            // Larger delays overflow the platform timer and fire almost immediately.
            timeout = remaining > MAX_TIMER_DELAY_MS
                ? setTimeout(scheduleTimeout, MAX_TIMER_DELAY_MS)
                : setTimeout(() => fail(new DeployTimeoutError(deployId, timeoutMs)), remaining);
        };

        timer = setInterval(tick, intervalMs);
        if (Number.isFinite(timeoutMs)) {
            scheduleTimeout();
        }

        void tick();

        void done.catch(() => undefined);

        return { cancel: stop, done };
    }

    public waitFor(
        deployId: string,
        options?: IDeployWatchOptions,
    ): Promise<IDeployConfirmedResult> {
        return this.watch(deployId, {}, options).done;
    }
}
