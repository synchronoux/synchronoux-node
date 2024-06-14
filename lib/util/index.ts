
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

    columnKeyTransformer(fields: { [key: string]: any }, columnMap: { [key: string]: any }, casing: "CAMEL_CASE" | "SNAKE_CASE" = "CAMEL_CASE") {
        const result: { [key: string]: any } = {};
        Object.keys(fields).forEach((key) => {
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

}

export * from "./Logger";
export * from "./RequestHelper";