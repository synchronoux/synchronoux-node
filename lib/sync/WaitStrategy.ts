import { SxObject } from "../util";

export enum WaitStrategy {

    TIMER,
    POLLING,
    WEBSOCKET,

}

export interface PollingOption {

    maxTimeCount: number;
    waitTimeMultiplier: number;

}

export enum WaitEvent {

    ENDED,
    FAILED,
    SUCCESS,
    STARTING,
    NEW_POLL,

}

export class Waiter {

    static poll<T>(pollOption: PollingOption, action: (params?: SxObject<any>) => Promise<T>, eventListener: (waitEvent: WaitEvent, waitTimeCount?: number, waitTimeInSeconds?: number, params?: SxObject<any>) => void, params?: SxObject<any>) {
        let waitTimeCount = 0;
        let maxWaitTimeCount = pollOption.maxTimeCount;
        let waitTimeInSeconds = pollOption.waitTimeMultiplier;

        eventListener(WaitEvent.STARTING, maxWaitTimeCount, waitTimeInSeconds, params);
        return new Promise((resolve, reject) => {
            const performPollingAction = async () => {
                eventListener(WaitEvent.NEW_POLL, waitTimeCount + 1, waitTimeInSeconds, params);
                try {
                    const result = await action(params);
                    if (result) {
                        eventListener(WaitEvent.SUCCESS, waitTimeCount + 1, waitTimeInSeconds, params);
                        resolve(result);
                        return;
                    }
                } catch (error: any) {
                    eventListener(WaitEvent.FAILED, waitTimeCount + 1, waitTimeInSeconds, params);
                    reject(error);
                    return;
                }
                waitTimeCount = waitTimeCount + 1;
                waitTimeInSeconds *= waitTimeInSeconds;
                if (waitTimeCount === maxWaitTimeCount) {
                    eventListener(WaitEvent.ENDED, waitTimeCount, waitTimeInSeconds, params);
                    return;
                }
                setTimeout(performPollingAction, (waitTimeInSeconds * 1000));
            }
            if (waitTimeCount === 0) {
                setTimeout(performPollingAction, (waitTimeInSeconds * 1000));
            }
        });
    }

}
