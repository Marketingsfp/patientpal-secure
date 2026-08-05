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
  interface QzSecurity {
    setCertificatePromise(
      cb: (resolve: (v: string) => void, reject: (e: unknown) => void) => void,
      options?: { rejectOnFailure?: boolean }
    ): void;
    setSignaturePromise(cb: (toSign: string) => (resolve: (v: string) => void, reject: (e: unknown) => void) => void): void;
    setSignatureAlgorithm?(alg: string): void;
  }
  interface QzApi {
    websocket: QzWebsocket;
    printers: QzPrinters;
    configs: QzConfigs;
    security: QzSecurity;
    print(config: unknown, data: unknown[]): Promise<void>;
  }
  const qz: QzApi;
  export default qz;
}