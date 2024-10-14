
import { Logger, SxObject, Util } from "../util";
import { Format, FormatType } from "./Format";

export class JsonFormat implements Format {

    protected static instance: JsonFormat;

    static async getInstance(barren?: boolean | undefined) {
        if (barren || !JsonFormat.instance) {
            const __instance = new JsonFormat();
            if (barren) return __instance;
            JsonFormat.instance = new JsonFormat();
        }
        return JsonFormat.instance;
    }

    extension(): string {
        return "json";
    }

    transformTo(record: SxObject<any>): Promise<string> {
        return JSON.stringify(record) as any;
    }

    transformFrom(content: string | Buffer): Promise<SxObject<any>[]> {
        const _content = Util.stringFrom(content);
        return JSON.parse(_content);
    }

}
