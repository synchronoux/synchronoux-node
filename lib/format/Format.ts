import { Logger, SxObject } from "../util";

export enum FormatType {
    XML = "XML",
    JSON = "JSON",
}

export interface Format<T> {

    getInstance(): Promise<T>;
    toBuffer(): Promise<Buffer>;
    toString(): Promise<string>;
    getLogger(): Promise<Logger>;
    transformRecordFrom<R>(format: FormatType, content: Buffer): Promise<R>;
    constructInstance(options?: SxObject<any>, barren?: boolean): Promise<T>;
    transformRecordsFrom<R>(format: FormatType, content: Buffer): Promise<R[]>;
    transformRecordTo<R>(format: FormatType, record: R): Promise<SxObject<any>>;
    transformRecordsTo<R>(format: FormatType, records: R[]): Promise<SxObject<any>[]>;

}
