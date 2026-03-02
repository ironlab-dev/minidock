declare module '@novnc/novnc/lib/rfb' {
    export default class RFB {
        constructor(target: HTMLElement, url: string, options?: { credentials?: { password: string } });
        scaleViewport: boolean;
        resizeSession: boolean;
        disconnect(): void;
        sendCtrlAltDel(): void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        addEventListener(event: string, handler: (e: any) => void): void;
    }
}

