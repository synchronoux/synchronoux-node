import { SxObject } from "../util";

export interface RecordMap<R> {

    model: any;
    columnMap: SxObject<string>;
    transformer: (record: R) => R;

}

export interface RecordTableMap<T> {
    [key:string]: RecordMap<T>;
}

export interface SyncRecord {

    pk: any;
    model: string;
    fields: SxObject<any>;

}
