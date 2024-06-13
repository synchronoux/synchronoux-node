import { Logger, SxObject } from "../util";

export interface MiddleFile {
    name: string;
    content?: Buffer;
    downloadUrl?: string;
}

export interface MiddleStore<T> {

    getInstance(): Promise<T>;
    getLogger(): Promise<Logger>;
    downloadFile(sourcePath: string): Promise<MiddleFile>;
    constructInstance(options?: SxObject<any>, barren?: boolean): Promise<T>;
    uploadFile(sourcePath: string, destinationPath: string, module: string): Promise<MiddleFile>;
    uploadBytes(sourcePath: string, destinationPath: string, module: string): Promise<MiddleFile>;

}
