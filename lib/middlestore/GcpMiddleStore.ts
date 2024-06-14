
import { Bucket, Storage } from "@google-cloud/storage";
import { MiddleFile, MiddleStore } from "./MiddleStore";
import { Logger, RequestHelper, SxObject } from "../util";
import { JWTInput, ExternalAccountClientOptions } from "google-auth-library";
import { GoogleAuthOptions } from "@google-cloud/storage/build/cjs/src/nodejs-common";

export enum GcpEvent {

    PULLED_PUBLIC_URLS = "PULLED_PUBLIC_URLS",
    CLEANUP_PULL_STARTING = "CLEANUP_PULL_STARTING",
    SKIPPING_PULL_CLEANUP = "SKIPPING_PULL_CLEANUP",
    SKIPPING_PUSH_CLEANUP = "SKIPPING_PUSH_CLEANUP",
    CLEANUP_PUSH_STARTING = "CLEANUP_PUSH_STARTING",
    CLEANUP_PULL_COMPLETED = "CLEANUP_PULL_COMPLETED",
    CLEANUP_PUSH_COMPLETED = "CLEANUP_PUSH_COMPLETED",
    PREPARING_TO_GET_DATA_FROM_URL = "PREPARING_TO_GET_DATA_FROM_URL",
    SUCCESSFULLY_GET_DATA_FROM_URL = "SUCCESSFULLY_GET_DATA_FROM_URL",

}

export interface GcpOption {

    bucket: string;
    logger?: Logger;
    skipCleanup?: boolean;
    storageOptions?: GoogleAuthOptions<any>;
    credentials: JWTInput | ExternalAccountClientOptions;
    eventListener?: (event: GcpEvent, message: string | Error, params?: any) => Promise<boolean>;

}

export class GcpMiddleStore implements MiddleStore {

    protected logger?: Logger;
    protected skipCleanup?: boolean;
    protected bucket: Bucket | undefined;
    protected static instance: GcpMiddleStore;
    protected eventListener?: (event: GcpEvent, message: string | Error, params?: any) => Promise<boolean>;

    constructor(options: GcpOption) {
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

    async waitAction(params?: SxObject<any> | undefined): Promise<any> {
        const result: string[] = [];
        let finishedCentralPull = false;
        const [files] = await this.bucket!.getFiles({ prefix: params?.folderName });
        files.forEach(file => {
            const publicUrl = file.publicUrl();
            result.push(publicUrl);
            if (publicUrl.includes("terminator")) finishedCentralPull = true;
        });
        if (!finishedCentralPull) return undefined;
        return result;
    }

    async loadFoundData(publicUrls: string[], cb: (content: string | Buffer, params?: any) => Promise<void>, params?: any) {
        this.eventListener && this.eventListener(GcpEvent.PULLED_PUBLIC_URLS, `[synchronoux] - GcpMiddleStore.loadFoundData: the found pulled urls '${publicUrls}'`, params);
        for (const publicUrl of publicUrls) {
            this.eventListener && this.eventListener(GcpEvent.PREPARING_TO_GET_DATA_FROM_URL, `[synchronoux] - GcpMiddleStore.loadFoundData: Preparing to load '${publicUrl}' from locations`, params);
            await cb(await RequestHelper.stringFromUrl(publicUrl.replace("%2F", "/"), { responseType: "text" }), params);
            this.eventListener && this.eventListener(GcpEvent.SUCCESSFULLY_GET_DATA_FROM_URL, `[synchronoux] - GcpMiddleStore.loadFoundData: Preparing to load '${publicUrl}' from locations ... completed`, params);
        }
    }

    uploadFile(sourcePath: string, destinationPath: string, module: string): Promise<MiddleFile> {
        throw new Error("Method not implemented.");
    }

    uploadBytes(sourcePath: string, destinationPath: string, module: string): Promise<MiddleFile> {
        throw new Error("Method not implemented.");
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
        const [files] = await this.bucket!.getFiles({ prefix: params?.folderName });
        files.forEach(file => file.delete());
        this.eventListener && this.eventListener(GcpEvent.CLEANUP_PULL_COMPLETED, `[synchronoux] - GcpMiddleStore.cleanup: successfully cleanup up after pull completed`, params);
    }

}