
import { Bucket, Storage } from "@google-cloud/storage";
import { MiddleFile, MiddleStore } from "./MiddleStore";
import { Logger, RequestHelper, SxObject } from "../util";
import { JWTInput, ExternalAccountClientOptions } from "google-auth-library";
import { GoogleAuthOptions } from "@google-cloud/storage/build/cjs/src/nodejs-common";

export enum GcpEvent {

    UPLOADED_DATA = "UPLOADED_DATA",
    UPLOADING_DATA = "UPLOADING_DATA",
    PULLED_PUBLIC_URLS = "PULLED_PUBLIC_URLS",
    CLEANUP_PULL_STARTING = "CLEANUP_PULL_STARTING",
    SKIPPING_PULL_CLEANUP = "SKIPPING_PULL_CLEANUP",
    SKIPPING_PUSH_CLEANUP = "SKIPPING_PUSH_CLEANUP",
    CLEANUP_PUSH_STARTING = "CLEANUP_PUSH_STARTING",
    CLEANUP_PULL_COMPLETED = "CLEANUP_PULL_COMPLETED",
    CLEANUP_PUSH_COMPLETED = "CLEANUP_PUSH_COMPLETED",
    GET_DATA_FROM_URL_FAILED = "GET_DATA_FROM_URL_FAILED",
    PREPARING_TO_GET_DATA_FROM_URL = "PREPARING_TO_GET_DATA_FROM_URL",
    SUCCESSFULLY_GET_DATA_FROM_URL = "SUCCESSFULLY_GET_DATA_FROM_URL",

}

export interface GcpOption {

    bucket: string;
    logger?: Logger;
    public?: boolean;
    skipCleanup?: boolean;
    storageOptions?: GoogleAuthOptions<any>;
    credentials: JWTInput | ExternalAccountClientOptions;
    eventListener?: (event: GcpEvent, message: string | Error, params?: any) => Promise<boolean>;

}

export class GcpMiddleStore implements MiddleStore {

    protected logger?: Logger;
    protected public?: boolean;
    protected skipCleanup?: boolean;
    protected bucket: Bucket | undefined;
    protected static instance: GcpMiddleStore;
    protected eventListener?: (event: GcpEvent, message: string | Error, params?: any) => Promise<boolean>;

    constructor(options: GcpOption) {
        this.public = options.public;
        this.logger = options.logger;
        this.skipCleanup = options.skipCleanup;
        this.eventListener = options.eventListener;
        this.bucket = new Storage({ credentials: options.credentials, ...options.storageOptions }).bucket(options.bucket);
    }

    static getInstance(options?: GcpOption, refresh?: boolean, barren?: boolean) {
        if (options && (refresh || barren || !GcpMiddleStore.instance)) {
            const instance = new GcpMiddleStore(options);
            if (barren) return instance;
            GcpMiddleStore.instance = instance;
        }
        return GcpMiddleStore.instance;
    }

    private async hasTerminatorFile(params?: SxObject<any> | undefined) {
        const [files] = await this.bucket!.getFiles({ prefix: params?.pullFolderName + "/terminator" });
        for (const file of files) {
            if (file.publicUrl().includes("terminator")) return true;
        }
        return false;
    }

    async waitAction(params?: SxObject<any> | undefined): Promise<any> {
        if (!(await this.hasTerminatorFile(params))) {
            return undefined;
        }
        const result: string[] = [];
        const [files] = await this.bucket!.getFiles({ prefix: params?.pullFolderName });
        files.forEach(file => result.push(file.publicUrl()));
        return result;
    }

    async loadFoundData(publicUrls: string[], cb: (content: string | Buffer, params?: any) => void, params?: any) {
        this.eventListener && this.eventListener(GcpEvent.PULLED_PUBLIC_URLS, `[synchronoux] - GcpMiddleStore.loadFoundData: the found pulled urls '${publicUrls}'`, params);
        for (const publicUrl of publicUrls) {
            this.eventListener && this.eventListener(GcpEvent.PREPARING_TO_GET_DATA_FROM_URL, `[synchronoux] - GcpMiddleStore.loadFoundData: Preparing to load '${publicUrl}' from locations`, params);
            try {
                cb(await RequestHelper.stringFromUrl(publicUrl.replace("%2F", "/"), { responseType: "text", timeout: 21474836 }), params);
            } catch (err: any) {
                if ((this.eventListener && (await this.eventListener(GcpEvent.GET_DATA_FROM_URL_FAILED, `[synchronoux] - GcpMiddleStore.loadFoundData: Failed to load '${publicUrl}' from locations ... failed`, params)))) {
                    throw err;
                }
                return;
            }
            this.eventListener && this.eventListener(GcpEvent.SUCCESSFULLY_GET_DATA_FROM_URL, `[synchronoux] - GcpMiddleStore.loadFoundData: Preparing to load '${publicUrl}' from locations ... completed`, params);
        }
    }

    async uploadFile(source: string, destinationPath: string, module?: string, params?: any): Promise<MiddleFile> {
        const args = { ...(params ?? {}), module, source, destinationPath, };
        this.eventListener && this.eventListener(GcpEvent.UPLOADING_DATA, `[synchronoux] - GcpMiddleStore.upload: uploading file to ${destinationPath}`, args);
        const [result, ] = await this.bucket!.upload(source, {
            public: this.public,
            destination: destinationPath,
        });
        this.eventListener && this.eventListener(GcpEvent.UPLOADED_DATA, `[synchronoux] - GcpMiddleStore.upload: uploading file to ${destinationPath}`, args);
        return result;
    }

    async uploadString(source: string, destinationPath: string, module?: string, params?: any): Promise<MiddleFile> {
        const args = { ...(params ?? {}), module, source, destinationPath, };
        this.eventListener && this.eventListener(GcpEvent.UPLOADING_DATA, `[synchronoux] - GcpMiddleStore.upload: uploading string to ${destinationPath}`, args);
        const file = await this.bucket!.file(destinationPath);
        await file.save(source);
        this.eventListener && this.eventListener(GcpEvent.UPLOADED_DATA, `[synchronoux] - GcpMiddleStore.upload: uploading string to ${destinationPath}`, args);
        return file;
    }

    async cleanup(event: "PULL" | "PUSH", params?: SxObject<any> | undefined): Promise<any> {
        if (event === "PUSH") {
            if (this.skipCleanup) {
                this.eventListener && this.eventListener(GcpEvent.SKIPPING_PUSH_CLEANUP, `[synchronoux] - GcpMiddleStore.cleanup: skipping cleanup after push completed`, params);
                return;
            }
            this.eventListener && this.eventListener(GcpEvent.CLEANUP_PUSH_STARTING, `[synchronoux] - GcpMiddleStore.cleanup: cleaning up after push completed`, params);
            this.eventListener && this.eventListener(GcpEvent.CLEANUP_PUSH_COMPLETED, `[synchronoux] - GcpMiddleStore.cleanup: successfully cleanup up after push completed`, params);
            return;
        }
        if (this.skipCleanup) {
            this.eventListener && this.eventListener(GcpEvent.SKIPPING_PULL_CLEANUP, `[synchronoux] - GcpMiddleStore.cleanup: skipping cleanup after pull completed`, params);
            return;
        }
        this.eventListener && this.eventListener(GcpEvent.CLEANUP_PULL_STARTING, `[synchronoux] - GcpMiddleStore.cleanup: cleaning up after pull completed`, params);
        const [files] = await this.bucket!.getFiles({ prefix: params?.pullFolderName });
        for (const file of files) {
            await file.delete();
        }
        this.eventListener && this.eventListener(GcpEvent.CLEANUP_PULL_COMPLETED, `[synchronoux] - GcpMiddleStore.cleanup: successfully cleanup up after pull completed`, params);
    }

}