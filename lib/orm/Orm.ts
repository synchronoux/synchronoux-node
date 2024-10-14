
import { SxObject } from "../util";
import { RecordMap, RecordTableMap, SyncRecord } from "../sync/RecordMap";

export enum OrmType {
    PRISMA,
    SEQUELIZE,
    RAW_QUERY_MYSQL,
    RAW_QUERY_SQLITE,
    RAW_QUERY_POSTGRES,
}

export enum OrmWriteMode {

    CREATE_ONLY,
    UPDATE_ONLY,
    UPDATE_IF_EXISTS_ELSE_CREATE,

}

export interface Orm {

    writeRecords(recordMap: RecordMap<any>, records: SyncRecord[]): Promise<number>;
    writeRecord(recordMap: RecordMap<any>, record: SyncRecord, table?: string): Promise<number>;
    readRecords<R>(recordTableMap: RecordTableMap<any>, cb: (table: string, r: R) => void, params?: SxObject<any>): Promise<void>;
    readRecord<R>(recordMap: RecordMap<any>, cb: (table: string, r: R) => void, params?: SxObject<any>, table?: string): Promise<void>;

}
