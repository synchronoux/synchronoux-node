import { RecordMap } from "../sync/RecordMap";
import { Logger, SxObject } from "../util";

export enum OrmType {
    PRISMA = "PRISMA",
    SEQUELIZE = "SEQUELIZE",
    RAW_QUERY_MYSQL = "RAW_QUERY_MYSQL",
    RAW_QUERY_SQLITE = "RAW_QUERY_SQLITE",
    RAW_QUERY_POSTGRES = "RAW_QUERY_POSTGRES",
}

export interface Orm<T> {

    getInstance(): Promise<T>;
    getLogger(): Promise<Logger>;
    readRecord<R>(options: SxObject<any>): Promise<R>;
    readRecords<R>(options: SxObject<any>): Promise<R[]>;
    writeRecord<R>(recordMap: RecordMap<R>, record: R): Promise<boolean>;
    writeRecords<R>(recordMap: RecordMap<R>, records: R[]): Promise<boolean>;
    constructInstance(options?: SxObject<any>, barren?: boolean): Promise<T>;

}
