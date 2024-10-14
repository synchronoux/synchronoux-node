
import { Orm } from "../orm";
import { Format } from "../format";
import { MiddleStore } from "../middlestore";
import { Logger, SxObject, Util } from "../util";
import { JsonFormat } from "../format/JsonFormat";
import { RecordTableMap, SyncRecord } from "./RecordMap";
import { PollingOption, WaitEvent, WaitStrategy, Waiter } from "./WaitStrategy";

export enum SyncEvent {

    PULL_FAILED = "PULL_FAILED",
    PUSH_FAILED = "PUSH_FAILED",
    SYNC_ABORTED = "SYNC_ABORTED",
    PULL_ABORTED = "PULL_ABORTED",
    PUSH_ABORTED = "PUSH_ABORTED",
    STARTING_PULL = "STARTING_PULL",
    STARTING_PUSH = "STARTING_PUSH",
    SYNC_COMPLETED = "SYNC_COMPLETED",
    PERSIST_ABORTED = "PERSIST_ABORTED",
    START_PULL_FAIL = "START_PULL_FAIL",
    NO_RECORD_MAPPING = "NO_RECORD_MAPPING",
    PERSISTING_FAILED = "PERSISTING_FAILED",
    STARTING_PERSISTING = "STARTING_PERSISTING",
    SYNC_PULL_COMPLETED = "SYNC_PULL_COMPLETED",
    SYNC_PUSH_COMPLETED = "SYNC_PUSH_COMPLETED",
    PERSISTING_COMPLETED = "PERSISTING_COMPLETED",
    UNKNOWN_WAIT_STRATEGY = "UNKNOWN_WAIT_STRATEGY",
    PULL_FOUND_DATA_COMPLETED = "PULL_FOUND_DATA_COMPLETED",

    WAIT_EVENT_ENDED = "WAIT_EVENT_ENDED",
    WAIT_EVENT_FAILED = "WAIT_EVENT_FAILED",
    WAIT_EVENT_SUCCESS = "WAIT_EVENT_SUCCESS",
    WAIT_EVENT_STARTING = "WAIT_EVENT_STARTING",
    WAIT_EVENT_NEW_POLL = "WAIT_EVENT_NEW_POLL",

}

export enum SyncPriority {

    PULL,
    PUSH,
    PUSH_PULL,
    PULL_PUSH,
    PULL_PERSIST,
    PULL_PUSH_PERSIST,
    PULL_PERSIST_PUSH,
    PUSH_PULL_PERSIST,

}

export enum SyncState {

    IDLE,
    PUSHING,
    PULLING,
    PERSISTING,
    PULL_FAILED,
    PUSH_FAILED,
    PERSISTING_FAILED,
    PULLING_FETCHING_DATA,
    PERSISTING_AND_PUSHING,

}

export enum SyncFailureStrategy {

    FAIL_FAST,
    RESILIENT,
    FAIL_FOR_PUSH,
    FAIL_FOR_PULL,

}

export interface SyncOption {

    orm: Orm;
    format: Format;
    logger?: Logger;
    resilient?: boolean;
    middleStore: MiddleStore;
    waitOption: PollingOption;
    waitStrategy: WaitStrategy;
    syncPriority?: SyncPriority;
    maxRecordsPerUpload?: number;
    useReverseColumnMapOnPush?: boolean;
    recordTableMap: RecordTableMap<any>;
    eventListener?(event: SyncEvent, message: string | Error, params?: any): void;

}

export class Sync {

    protected orm: Orm;
    protected format: Format;
    protected resilient: boolean;
    protected static instance: Sync;
    protected processIncr: number = 0;
    protected middleStore: MiddleStore;
    protected waitOption: PollingOption;
    protected waitStrategy: WaitStrategy;
    protected syncPriority: SyncPriority;
    protected maxRecordsPerUpload: number;
    protected recordTableMap: RecordTableMap<any>;
    protected syncStatus: SyncState = SyncState.IDLE;
    protected eventListener?: (event: SyncEvent, message: string | Error, params?: any) => void;

    constructor(options: SyncOption) {
        this.orm = options.orm;
        this.format = options.format;
        this.waitOption = options.waitOption;
        this.middleStore = options.middleStore;
        this.waitStrategy = options.waitStrategy;
        this.eventListener = options.eventListener;
        this.resilient = options.resilient ??  false;
        this.recordTableMap = options.recordTableMap;
        this.maxRecordsPerUpload = options.maxRecordsPerUpload ?? 1000;
        this.syncPriority = options.syncPriority ?? SyncPriority.PULL_PERSIST_PUSH;

        this.loadPulledData = this.loadPulledData.bind(this);
        this.waitEventListener = this.waitEventListener.bind(this);
        this.checkAndReportStepCompletion = this.checkAndReportStepCompletion.bind(this);
        this.loadSingleRecordFromPulledData = this.loadSingleRecordFromPulledData.bind(this);
    }

    static async getInstance(options?: SyncOption, refresh?: boolean, barren?: boolean) {
        if (options && (refresh || barren || !Sync.instance)) {
            const instance = new Sync(options);
            if (barren) return instance;
            Sync.instance = instance;
        }
        return Sync.instance;
    }

    getState() {
        return this.syncStatus;
    }

    initiate(params: SxObject<any> = {}, cb?: (result: any) => void) {
        if (this.syncStatus !== SyncState.IDLE) {
            this.eventListener && this.eventListener(SyncEvent.SYNC_ABORTED, "the sync instance is not in idle state", params);
            return;
        }
        if (`${SyncPriority[this.syncPriority]}`.startsWith("PULL_")) {
            this.pull({ ...params, __internal_invocation__: true }, cb);
        } else if (`${SyncPriority[this.syncPriority]}`.startsWith("PUSH_")) {
            this.push({ ...params, __internal_invocation__: true });
        } else {
            throw new Error(`Unknown priority '${this.syncPriority}' no sync operation`);
        }
    }

    pull(params: SxObject<any> = {}, cb?: (result: any) => void) {
        if (this.syncStatus !== SyncState.IDLE) {
            this.eventListener && this.eventListener(SyncEvent.PULL_ABORTED, "the sync instance is not in idle state", params);
            return;
        }
        this.processIncr += 2;
        this.syncStatus = SyncState.PULLING;
        this.eventListener && this.eventListener(SyncEvent.STARTING_PULL, "starting the pull", params);
        let waitPromise;
        if (this.waitStrategy === WaitStrategy.POLLING) {
            waitPromise = Waiter.poll(this.waitOption as PollingOption, this.middleStore.waitAction.bind(this.middleStore), this.waitEventListener, params);
        }
        if (!waitPromise) {
            this.eventListener && this.eventListener(SyncEvent.UNKNOWN_WAIT_STRATEGY, "the specified wait strategy was not recognized", params);
            return;
        }
        waitPromise.then(async (result: any) => {
            this.eventListener && this.eventListener(SyncEvent.WAIT_EVENT_SUCCESS, "wait successful, found data", params);
            let __internal_persisting__ = (params?.__internal_invocation__ && `${SyncPriority[this.syncPriority]}`.includes("_PERSIST"));
            await this.checkAndReportStepCompletion(SyncState.PULLING_FETCHING_DATA, params);
            await this.checkAndReportStepCompletion(SyncState.PULLING, { ...params, __internal_persisting__ });
            this.syncStatus = SyncState.IDLE;
            cb && cb(result);
            if (!params?.__internal_invocation__) return;
            if (this.syncPriority === SyncPriority.PULL_PERSIST_PUSH || this.syncPriority === SyncPriority.PULL_PERSIST || this.syncPriority === SyncPriority.PUSH_PULL_PERSIST) {
                this.persist(result, { ...params, __internal_invocation__: true });
            } else if (this.syncPriority === SyncPriority.PULL_PUSH || this.syncPriority === SyncPriority.PULL_PUSH_PERSIST) {
                this.push({ ...params, __internal_result__: result, __internal_invocation__: true });
            }
        }).catch((error) => {
            this.eventListener && this.eventListener(SyncEvent.WAIT_EVENT_FAILED, error, params);
            this.eventListener && this.eventListener(SyncEvent.PULL_FAILED, error, params);
            if (this.syncPriority === SyncPriority.PUSH_PULL) {
                this.checkAndReportStepCompletion(SyncState.PULL_FAILED, params);
            }
        });
    }

    persist(data: any, params: SxObject<any> = {}) {
        if (this.syncStatus !== SyncState.IDLE) {
            this.eventListener && this.eventListener(SyncEvent.PERSIST_ABORTED, "the sync instance is not in idle state", params);
            return;
        }
        this.processIncr++;
        this.syncStatus = SyncState.PERSISTING;
        this.eventListener && this.eventListener(SyncEvent.STARTING_PERSISTING, "starting persist", params);
        this.loadPulledData(data, params).then(async (_) => {
            await this.checkAndReportStepCompletion(SyncState.PERSISTING, { ...params, __internal_persisting__: true });
            if (!params?.__internal_invocation__) return;
            if (this.syncPriority === SyncPriority.PULL_PERSIST_PUSH) {
                this.push({ ...params, __internal_invocation__: true });
            }
        }).catch((error) => {
            this.eventListener && this.eventListener(SyncEvent.PERSISTING_FAILED, error, params);
            if (this.syncPriority === SyncPriority.PULL_PERSIST || this.syncPriority === SyncPriority.PULL_PUSH_PERSIST || this.syncPriority === SyncPriority.PUSH_PULL_PERSIST) {
                this.checkAndReportStepCompletion(SyncState.PERSISTING_FAILED, params);
            }
        });
    }

    push(params: SxObject<any> = {}) {
        if (this.syncStatus !== SyncState.IDLE) {
            this.eventListener && this.eventListener(SyncEvent.PUSH_ABORTED, "the sync instance is not in idle state", params);
            return;
        }
        this.processIncr++;
        let module = "unknown";
        let pushUploadCount = 0;
        let collectedRecords: any[] = [];
        this.syncStatus = SyncState.PUSHING;
        const fileExtension = this.format.extension();
        this.eventListener && this.eventListener(SyncEvent.STARTING_PUSH, "starting the push", params);
        this.orm.readRecords(this.recordTableMap, async (table: string, records: any) => {
            module = table;
            for (const record of records) collectedRecords.push(record);
            if (collectedRecords.length >= this.maxRecordsPerUpload) {
                const cachedCollectedRecords = collectedRecords;
                collectedRecords = [];
                await this.middleStore.uploadString(await this.format.transformTo(cachedCollectedRecords), params?.pushFolderName + "/" + (`push_${++pushUploadCount}.${fileExtension}`), module, params);
            }
        }, params).then(async () => {
            return new Promise<void>(async (resolve, reject) => {
                try {
                    await this.middleStore.uploadString(await this.format.transformTo(collectedRecords), params?.pushFolderName + "/" + (`push_${++pushUploadCount}.${fileExtension}`), module, params);
                    await this.middleStore.uploadString("[]", params?.pushFolderName + "/" + (`terminator.${fileExtension}`), "terminator", params);
                    await this.checkAndReportStepCompletion(SyncState.PUSHING, params);
                    if (!params?.__internal_invocation__) return;
                    if (this.syncPriority === SyncPriority.PUSH_PULL || this.syncPriority === SyncPriority.PUSH_PULL_PERSIST) {
                        this.pull({ ...params, __internal_invocation__: true });
                    } else if (this.syncPriority === SyncPriority.PULL_PUSH_PERSIST) {
                        if (!params.__internal_result__) {
                            throw new Error("The data to persist is not present");
                        }
                        this.persist(params.__internal_result__, { ...params, __internal_invocation__: true });
                    }
                    resolve();
                } catch (err: any) {
                    reject(err);
                }
            });
        }).catch((error) => {
            this.eventListener && this.eventListener(SyncEvent.PUSH_FAILED, error, params);
            if (this.syncPriority === SyncPriority.PULL_PUSH || this.syncPriority === SyncPriority.PULL_PERSIST_PUSH) {
                this.checkAndReportStepCompletion(SyncState.PUSH_FAILED, params);
            }
        });
    }

    private async loadPulledData(data: any, params?: any) {
        await this.middleStore.loadFoundData(data, this.loadSingleRecordFromPulledData, params);
    }

    protected async loadSingleRecordFromPulledData(content: string | Buffer, params?: any) {
        const records = await this.format.transformFrom(content) as SyncRecord[];
        for (const record of records) {
            if (!(record.model in this.recordTableMap)) {
                this.eventListener && this.eventListener(SyncEvent.NO_RECORD_MAPPING, `No record mapping for the record: ${record.model}`, params);                
                return;
            }
            const recordMap = this.recordTableMap[record.model];
            await this.orm.writeRecord(recordMap, record);
        }
    }

    protected async waitEventListener(waitEvent: WaitEvent, waitTimeCount?: number, waitTimeInSeconds?: number, params?: any) {
        if (waitEvent === WaitEvent.ENDED) {
            this.eventListener && this.eventListener(SyncEvent.WAIT_EVENT_ENDED, "end waiting for pull", params);
        } else if (waitEvent === WaitEvent.STARTING) {
            this.eventListener && this.eventListener(SyncEvent.WAIT_EVENT_STARTING, "starting waiting for pull", params);
        } else if (waitEvent === WaitEvent.NEW_POLL) {
            this.eventListener && this.eventListener(SyncEvent.WAIT_EVENT_NEW_POLL, `checking pull, check ${waitTimeCount} after ${waitTimeInSeconds} seconds wait`, params);
        }
    }

    protected async checkAndReportStepCompletion(syncState: SyncState, params?: any) {
        if (syncState === SyncState.PULLING) {
            if (!params.__internal_persisting__) {
                await this.middleStore.cleanup("PULL", params);
            }
            this.eventListener && this.eventListener(SyncEvent.SYNC_PULL_COMPLETED, "sync pull completed successfully", params);
        } else if (syncState === SyncState.PUSHING) {
            await this.middleStore.cleanup("PUSH", params);
            this.eventListener && this.eventListener(SyncEvent.SYNC_PUSH_COMPLETED, "sync push completed successfully", params);
        } else if (syncState === SyncState.PERSISTING) {
            if (params.__internal_persisting__) {
                await this.middleStore.cleanup("PULL", params);
            }
            this.eventListener && this.eventListener(SyncEvent.PERSISTING_COMPLETED, "successfully write remote record", params);
        } else if (syncState === SyncState.PULLING_FETCHING_DATA) {
            this.eventListener && this.eventListener(SyncEvent.PULL_FOUND_DATA_COMPLETED, "successfully confirm remote record availability", params);
        }
        if (syncState) this.processIncr--;
        if (this.processIncr !== 0) return;
        this.syncStatus = SyncState.IDLE;
        const priority = `${SyncPriority[this.syncPriority]}`;
        const completed = ((priority.endsWith("PULL") && syncState === SyncState.PULLING)
                                || (priority.endsWith("PUSH") && syncState === SyncState.PUSHING)
                                || (priority.endsWith("PERSIST") && syncState === SyncState.PERSISTING));
        if (completed) {
            this.eventListener && this.eventListener(SyncEvent.SYNC_COMPLETED, "sync completed successfully", params);
        }
    }

}

export async function buildDefaultSyncOption(options: Partial<SyncOption>): Promise<SyncOption> {
    return {
        logger: options.logger,
        eventListener: options.eventListener,
        orm: Util.notNull(".orm", options.orm),
        maxRecordsPerUpload: options.maxRecordsPerUpload ?? 1000,
        format: options.format ?? await JsonFormat.getInstance(),
        waitStrategy: options.waitStrategy ?? WaitStrategy.POLLING,
        middleStore: Util.notNull(".middleStore", options.middleStore),
        syncPriority: options.syncPriority ?? SyncPriority.PULL_PUSH_PERSIST,
        recordTableMap: Util.notNull(".recordTableMap", options.recordTableMap),
        waitOption: options.waitOption ?? {
            maxTimeCount: 1000,
            waitTimeMultiplier: 1,
        },
    };
}