
import { Model } from "sequelize";
import { SxObject, Util } from "../util";
import { Orm, OrmWriteMode } from "./Orm";
import { RecordMap, RecordTableMap, SyncRecord } from "../sync";

export enum OrmEvent {

    CREATE_NEW_RECORD,
    SKIP_WRITING_RECORD,
    UPDATE_EXISTING_RECORD,
    PREPARING_TO_WRITE_RECORD,
    WHERE_FUNCTION_RETURN_FALSE,

}

export interface SequelizeOrmOption {

    limitPerQuery?: number;
    writeMode?: OrmWriteMode;
    reverseColumnMapOnRead?: boolean;
    whereFunction?: (record: SyncRecord) => SxObject<any> | boolean;
    eventListener?: (event: OrmEvent, message: string | Error, record: SyncRecord) => Promise<boolean>;

}

export class SequelizeOrm implements Orm {

    protected limitPerQuery: number;
    protected writeMode: OrmWriteMode;
    protected static instance: SequelizeOrm;
    protected reverseColumnMapOnRead: boolean;
    protected whereFunction?: (record: SyncRecord) => SxObject<any> | boolean;
    protected eventListener?: (event: OrmEvent, message: string | Error, record: SyncRecord) => Promise<boolean>;

    constructor(options?: SequelizeOrmOption) {
        this.whereFunction = options?.whereFunction;
        this.eventListener = options?.eventListener;
        this.limitPerQuery = options?.limitPerQuery ?? 100;
        this.reverseColumnMapOnRead = options?.reverseColumnMapOnRead ?? true;
        this.writeMode = options?.writeMode ?? OrmWriteMode.UPDATE_IF_EXISTS_ELSE_CREATE;

        this.broadCaseEvent = this.broadCaseEvent.bind(this);
    }

    static getInstance(options?: SequelizeOrmOption, refresh?: boolean, barren?: boolean) {
        if (options && (refresh || barren || !SequelizeOrm.instance)) {
            const instance = new SequelizeOrm(options);
            if (barren) return instance;
            SequelizeOrm.instance = instance;
        }
        return SequelizeOrm.instance;
    }

    async readRecord<R>(recordMap: RecordMap<any>, cb: (table: string, r: R) => void, params?: SxObject<any>, table?: string): Promise<void> {
        const filter = (recordMap.dataQuery 
            ? (typeof recordMap.dataQuery === "function" ? recordMap.dataQuery() : recordMap.dataQuery)
            : {});
        const filterQuery = Util.mergeObjects(true, params?.dataQuery ?? {}, filter);
        const recordsCount = await recordMap.model.count(filterQuery);
        const maxQueryOps = Math.ceil(recordsCount / this.limitPerQuery);
        for (let page = 0; page < maxQueryOps; page++) {
            filterQuery.limit = this.limitPerQuery;
            filterQuery.offset = page * this.limitPerQuery;
            let records = await recordMap.model.findAll(filterQuery);
            if (recordMap.transformTo) {
                records = await recordMap.transformTo(records);
            }
            if (this.reverseColumnMapOnRead) {
                const reversedColumnMap = Util.reverseObjectEntries(recordMap.columnMap);
                records = records.map((record: any) => {
                    let field;
                    let fields = record;
                    if (!!record.fields) {
                        field = "fields";
                        fields = record.fields;
                    } else if (!!record.dataValues) {
                        field = "dataValues";
                        fields = record.dataValues;
                    }
                    fields = Util.columnKeyTransformer(fields, reversedColumnMap, (recordMap.reverseNameCasing ?? "SNAKE_CASE"));
                    if (!field) return fields;
                    record[field] = fields;
                    return record;
                });
            }
            cb(table ?? "<not-set>", records);
        }
    }

    async readRecords<R>(recordTableMap: RecordTableMap<any>, cb: (table: string, r: R) => void, params?: SxObject<any>): Promise<void> {
        for (const key in recordTableMap) {
            await this.readRecord(recordTableMap[key], cb, params, key);
        }
    }

    // TODO try catch to report error if resilient
    async writeRecord(recordMap: RecordMap<any>, record: SyncRecord): Promise<number> {
        let existingRecord: any;
        if (!await this.broadCaseEvent(OrmEvent.PREPARING_TO_WRITE_RECORD, "preparing to write record", record)) {
            this.broadCaseEvent(OrmEvent.SKIP_WRITING_RECORD, "skipping the writing the record", record);
            return 0;
        }
        let fields = Util.columnKeyTransformer((record.fields ?? record), recordMap.columnMap, recordMap.nameCasing);
        if (recordMap.transformFrom) {
            fields = await recordMap.transformFrom(fields);
        }
        let whereClause: SxObject<any> = { id: record.pk };
        if (this.whereFunction) {
            const whereResult = this.whereFunction({ ...record, fields });
            if (typeof whereResult !== "boolean") {
                whereClause = whereResult;
            } else if (whereResult === false) {
                this.broadCaseEvent(OrmEvent.WHERE_FUNCTION_RETURN_FALSE, "skipping the record sync", record);
                return 0;
            }
        }

        if (this.writeMode === OrmWriteMode.UPDATE_ONLY || this.writeMode === OrmWriteMode.UPDATE_IF_EXISTS_ELSE_CREATE) {
            existingRecord = await recordMap.model.findOne({ where: whereClause });
            if (existingRecord) {
                await recordMap.model.update(fields, { where: whereClause });
                this.broadCaseEvent(OrmEvent.UPDATE_EXISTING_RECORD, "successfully updated an existing record", record);
                return 1;
            }
            if (this.writeMode === OrmWriteMode.UPDATE_ONLY) {
                return 0;
            }
        }
        await recordMap.model.create(fields);
        this.broadCaseEvent(OrmEvent.CREATE_NEW_RECORD, "successfully create a new record", record);
        return 1;
    }

    async writeRecords(recordMap: RecordMap<any>, records: SyncRecord[]): Promise<number> {
        let writtenRecords = 0;
        for (const record of records) {
            writtenRecords += (await this.writeRecord(recordMap, record));
        }
        return writtenRecords;
    }

    async broadCaseEvent(event: OrmEvent, message: string | Error, record: SyncRecord) {
        if (!this.eventListener) return true;
        return await this.eventListener(event, message, record)
    }

}
