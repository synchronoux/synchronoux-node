import { Logger, SxObject } from "../util";

export interface MiddleFile {
    name: string;
    content?: Buffer;
    downloadUrl?: string;
}

export interface MiddleStore {

    waitAction(params?: SxObject<any>): Promise<any>;
    cleanup(event: "PULL" | "PUSH", params?: SxObject<any>): Promise<any>;
    uploadFile(sourcePath: string, destinationPath: string, module: string): Promise<MiddleFile>;
    uploadBytes(sourcePath: string, destinationPath: string, module: string): Promise<MiddleFile>;
    loadFoundData(publicUrls: string[], cb: (content: string | Buffer, params?: any) => Promise<void>, params?: any): void;

}
