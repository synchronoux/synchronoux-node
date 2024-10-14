import { SxObject } from "../util";

export interface RecordMap<R> {

    model: any;
    columnMap: SxObject<string>;
    dataQuery?: (() => any) | any;
    nameCasing?: "CAMEL_CASE" | "SNAKE_CASE";
    transformFrom: (record: R) => Promise<R>;
    transformTo: (record: R[]) => Promise<R[]>;
    reverseNameCasing?: "CAMEL_CASE" | "SNAKE_CASE";

}

export interface RecordTableMap<T> {
    [key:string]: RecordMap<T>;
}

export interface SyncRecord {

    pk: any;
    model: string;
    fields: SxObject<any>;

}
