declare module "qz-tray" {
  interface QzWebsocket {
    isActive(): boolean;
    connect(options?: unknown): Promise<void>;
    disconnect(): Promise<void>;
  }
  interface QzPrinters {
    getDefault(): Promise<string>;
    find(query?: string): Promise<string | string[]>;
  }
  interface QzConfigs {
    create(printer: string, options?: unknown): unknown;
  }
  interface QzApi {
    websocket: QzWebsocket;
    printers: QzPrinters;
    configs: QzConfigs;
    print(config: unknown, data: unknown[]): Promise<void>;
  }
  const qz: QzApi;
  export default qz;
}