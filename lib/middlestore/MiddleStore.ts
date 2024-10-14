import { Logger, SxObject } from "../util";

export interface MiddleFile {
    name: string;
    content?: Buffer;
    downloadUrl?: string;
}

export interface MiddleStore {

    waitAction(params?: SxObject<any>): Promise<any>;
    cleanup(event: "PULL" | "PUSH", params?: SxObject<any>): Promise<any>;
    uploadFile(source: string, destinationPath: string, module?: string, params?: any): Promise<MiddleFile>;
    uploadString(source: string, destinationPath: string, module?: string, params?: any): Promise<MiddleFile>;
    loadFoundData(publicUrls: string[], cb: (content: string | Buffer, params?: any) => void, params?: any): void;

}
