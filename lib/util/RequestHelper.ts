
import ffs from "kyofuuc";

export const RequestHelper = {

    async stringFromUrl(url: string, options?: any) {
        return (await ffs.get(url, options as any)).body;
    },

}
