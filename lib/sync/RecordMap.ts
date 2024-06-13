import { SxObject } from "../util";

export interface RecordMap<R> {

    model: any;
    columnMap: SxObject<string>;
    transformer: (record: R) => R;

}
