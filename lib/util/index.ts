
export interface SxObject<T> {
    [key:string]: T;
}

export const Util = {

    stringFrom(content: string | Buffer, encoding?: BufferEncoding) {
        if (typeof content === "string") {
            return content;
        }
        return content.toString(encoding);
    },

    toCamelCase(str: string): string {
        return (str && str.replace(/[^a-zA-Z0-9]+(.)/g, function (word, index) {
            return index === 0 ? word.toLowerCase() : word.toUpperCase();
        }).replace(/\s+/g, '').replace(/\_/g, '')) || str;
    },

    toSnakeCase(str: string): string {
        let value = (str || "").replace(/[A-Z]+/g, letter => `_${letter.toLowerCase()}`);
        return value[0] == "_" ? value.substring(1) : value;
    },

    reverseObjectEntries(fields: SxObject<any>) {
        return Object.keys(fields ?? {}).reduce((acc: SxObject<any>, key: string) => {
            acc[fields[key]] = key;
            return acc;
        }, {});
    },

    columnKeyTransformer(fields: { [key: string]: any }, columnMap: { [key: string]: any }, casing: "CAMEL_CASE" | "SNAKE_CASE" = "CAMEL_CASE") {
        const result: { [key: string]: any } = {};
        Object.keys(fields ?? {}).forEach((key) => {
            let value = fields[key];
            if (value === null || value === undefined) return;
            if (key in columnMap) key = columnMap[key];
            result[casing === "CAMEL_CASE" ? Util.toCamelCase(key) : Util.toSnakeCase(key)] = value;
        });
        return result
    },

    notNull(name: string, param: any) {
        if (param === null || param === undefined) {
            throw new Error(`The parameter '${name}' must not be null or undefined`);
        }
        return param;
    },

    mergeObjectsNoneRecurse(...sources: any[]) {
        let result: any = {};
        for (const source of sources) {
            if (!source) continue;
            result = { ...result, ...source };
        }
        return result;
    },

    mergeObjectsRecurse(...sources: any[]) {
        let result: any = {};
        for (const source of sources) {
            if (!source) continue;
            Object.keys(source).forEach(key => {
                if (!result[key]) {
                    result[key] = source[key];
                } else if (result[key] instanceof Array && typeof result[key] == typeof source[key]) {
                    result[key] = result[key].concat(source[key]);
                } else if (typeof result[key] == "object" && typeof result[key] == typeof source[key]) {
                    result[key] = Util.mergeObjects(true, result[key], source[key]);
                }
            });
        }
        return result;
    },

    mergeObjects(recurse: boolean, ...sources: any[]) {
        if (!recurse) return Util.mergeObjectsNoneRecurse(...sources);
        return Util.mergeObjectsRecurse(...sources);
    },

}

export * from "./Logger";
export * from "./RequestHelper";