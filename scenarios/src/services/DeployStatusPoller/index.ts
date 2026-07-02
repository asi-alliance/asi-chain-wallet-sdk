import DeployService, {
    DeployStatus,
    IDeployStatusResult,
} from "../DeployService";

export interface IDeployConfirmedResult {
    deployId: string;
    blockHash?: string;
}

export interface IDeployWatchCallbacks {
    onConfirmed?: (result: IDeployConfirmedResult) => void;
    onError?: (error: Error) => void;
    onStatus?: (status: IDeployStatusResult, deployId: string) => void;
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

export default class DeployStatusPoller {
    private readonly deployService: DeployService;

    constructor(deployService: DeployService) {
        this.deployService = deployService;
    }

    public watch(
        deployId: string,
        callbacks: IDeployWatchCallbacks = {},
        {
            intervalMs = DEFAULT_INTERVAL_IN_MILLISECOND,
            timeoutMs = DEFAULT_TIMEOUT_IN_MILLISECONDS,
        }: IDeployWatchOptions = {},
    ): IDeployWatchHandle {
        const deadline = Date.now() + timeoutMs;

        let checking: boolean = false;
        let finished: boolean = false;
        let timer: ReturnType<typeof setInterval>;
        let resolveDone!: (result: IDeployConfirmedResult) => void;
        let rejectDone!: (error: Error) => void;

        const done = new Promise<IDeployConfirmedResult>((resolve, reject) => {
            resolveDone = resolve;
            rejectDone = reject;
        });

        const stop = (): void => {
            if (finished) {
                return;
            }

            finished = true;
            clearInterval(timer);
        };

        const succeed = (result: IDeployConfirmedResult): void => {
            stop();

            callbacks.onConfirmed?.(result);

            resolveDone(result);
        };

        const fail = (error: Error): void => {
            stop();

            callbacks.onError?.(error);

            rejectDone(error);
        };

        const tick = async (): Promise<void> => {
            if (checking || finished) {
                return;
            }

            checking = true;

            try {
                const status: IDeployStatusResult =
                    await this.deployService.getDeployStatus(deployId);

                callbacks.onStatus?.(status, deployId);

                if (status.status === DeployStatus.FINALIZED) {
                    succeed({ deployId });

                    return;
                }

                if (Date.now() > deadline) {
                    fail(
                        new Error(
                            `DeployStatusPoller: timeout for ${deployId}`,
                        ),
                    );
                }
            } catch (error: unknown) {
                fail(error instanceof Error ? error : new Error(String(error)));
            } finally {
                checking = false;
            }
        };

        timer = setInterval(tick, intervalMs);

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
