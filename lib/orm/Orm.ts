
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

    writeRecord(recordMap: RecordMap<any>, record: SyncRecord): Promise<number>;
    readRecord<R>(recordMap: RecordMap<any>, options: SxObject<any>): Promise<R>;
    writeRecords(recordMap: RecordMap<any>, records: SyncRecord[]): Promise<number>;
    readRecords<R>(recordTableMap: RecordTableMap<any>, options: SxObject<any>): Promise<R[]>;

}
