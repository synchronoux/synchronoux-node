
import { Orm } from "../orm";
import { Format } from "../format";
import { Logger, SxObject, Util } from "../util";
import { MiddleStore } from "../middlestore";
import { RecordTableMap, SyncRecord } from "./RecordMap";
import { PollingOption, WaitEvent, WaitStrategy, Waiter } from "./WaitStrategy";
import { JsonFormat } from "../format/JsonFormat";

export enum SyncEvent {

    PULL_FAILED = "PULL_FAILED",
    PULL_ABORTED = "PULL_ABORTED",
    PUSH_ABORTED = "PUSH_ABORTED",
    STARTING_PULL = "STARTING_PULL",
    STARTING_PUSH = "STARTING_PUSH",
    SYNC_COMPLETED = "SYNC_COMPLETED",
    START_PULL_FAIL = "START_PULL_FAIL",
    NO_RECORD_MAPPING = "NO_RECORD_MAPPING",
    SYNC_PULL_COMPLETED = "SYNC_PULL_COMPLETED",
    SYNC_PUSH_COMPLETED = "SYNC_PUSH_COMPLETED",
    UNKNOWN_WAIT_STRATEGY = "UNKNOWN_WAIT_STRATEGY",
    PULL_FOUND_DATA_COMPLETED = "PULL_FOUND_DATA_COMPLETED",
    PULL_WRITE_DATA_COMPLETED = "PULL_WRITE_DATA_COMPLETED",

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
    PULL_PERSIST_PUSH,

}

export enum SyncState {

    IDLE,
    PUSHING,
    PULLING,
    PULLING_WRITING_DATA,
    PULLING_FETCHING_DATA,
    PULLING_WRITING_DATA_AND_PUSHING,

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
    middleStore: MiddleStore;
    waitStrategy: WaitStrategy;
    syncPriority?: SyncPriority;
    waitOption: PollingOption;
    recordTableMap: RecordTableMap<any>;
    eventListener?(event: SyncEvent, message: string | Error, params?: any): void;

}

export class Sync {

    protected orm: Orm;
    protected format: Format;
    protected processIncr: number = 0;
    protected static instance: Sync;
    protected middleStore: MiddleStore;
    protected waitOption: PollingOption;
    protected waitStrategy: WaitStrategy;
    protected syncPriority: SyncPriority;
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
        this.recordTableMap = options.recordTableMap;
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

    pull(params?: SxObject<any>) {
        if (this.syncStatus === SyncState.PULLING) {
            this.eventListener && this.eventListener(SyncEvent.PULL_ABORTED, "the sync instance is currently in the pull state", params);
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
            this.checkAndReportStepCompletion(SyncState.PULLING_FETCHING_DATA, params);
            this.syncStatus = SyncState.PULLING_WRITING_DATA;
            if (this.syncPriority === SyncPriority.PULL_PERSIST_PUSH) {
                this.loadPulledData(result, params).then((_) => this.checkAndReportStepCompletion(SyncState.PULLING, params)).then((err) => {
                    // TODO report error if resilient, else fail process
                });
            } else if (this.syncPriority === SyncPriority.PULL || this.syncPriority === SyncPriority.PULL_PUSH || this.syncPriority === SyncPriority.PUSH_PULL) {
                await this.loadPulledData(result, params);
                this.checkAndReportStepCompletion(SyncState.PULLING, params);
            }
        }).catch((error) => {
            this.eventListener && this.eventListener(SyncEvent.WAIT_EVENT_FAILED, error, params);
            this.eventListener && this.eventListener(SyncEvent.PULL_FAILED, error, params);
        });
    }

    push(params?: SxObject<any>) {
        if (this.syncStatus === SyncState.PUSHING) {
            this.eventListener && this.eventListener(SyncEvent.PUSH_ABORTED, "the sync instance is currently in the push state", params);
            return;
        }
        this.processIncr += 2;
        this.syncStatus = SyncState.PUSHING;
        this.eventListener && this.eventListener(SyncEvent.STARTING_PUSH, "starting the push", params);
    }

    async loadPulledData(data: any, params?: any) {
        this.processIncr++;
        await this.middleStore.loadFoundData(data, this.loadSingleRecordFromPulledData);
        this.checkAndReportStepCompletion(SyncState.PULLING_WRITING_DATA, params);
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
            await this.middleStore.cleanup("PULL", params);
            this.eventListener && this.eventListener(SyncEvent.SYNC_PULL_COMPLETED, "sync pull completed successfully", params);
        } else if (syncState === SyncState.PUSHING) {
            await this.middleStore.cleanup("PUSH", params);
            this.eventListener && this.eventListener(SyncEvent.SYNC_PUSH_COMPLETED, "sync push completed successfully", params);
        } else if (syncState === SyncState.PULLING_FETCHING_DATA) {
            this.eventListener && this.eventListener(SyncEvent.PULL_FOUND_DATA_COMPLETED, "successfully confirm remote record availability", params);
        } else if (syncState === SyncState.PULLING_WRITING_DATA) {
            this.eventListener && this.eventListener(SyncEvent.PULL_WRITE_DATA_COMPLETED, "successfully write remote record", params);
        }
        if (syncState) this.processIncr--;
        if (this.processIncr !== 0) return;
        this.syncStatus = SyncState.IDLE;
        this.eventListener && this.eventListener(SyncEvent.SYNC_COMPLETED, "sync completed successfully", params);
    }

}

export async function buildDefaultSyncOption(options: Partial<SyncOption>): Promise<SyncOption> {
    return {
        logger: options.logger,
        eventListener: options.eventListener,
        orm: Util.notNull(".orm", options.orm),
        syncPriority: SyncPriority.PULL_PERSIST_PUSH,
        format: options.format ?? await JsonFormat.getInstance(),
        waitStrategy: options.waitStrategy ?? WaitStrategy.POLLING,
        middleStore: Util.notNull(".middleStore", options.middleStore),
        recordTableMap: Util.notNull(".recordTableMap", options.recordTableMap),
        waitOption: options.waitOption ?? {
            maxTimeCount: 1000,
            waitTimeMultiplier: 1,
        },
    };
}