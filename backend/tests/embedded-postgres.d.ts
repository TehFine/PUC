// Gói embedded-postgres chỉ phát hành ESM; moduleResolution "Node" không đọc được kiểu của nó.
// Chỉ khai báo phần test sử dụng. Lúc chạy, Node 22.12+ nạp ESM bằng require().
declare module "embedded-postgres" {
  interface EmbeddedPostgresOptions {
    databaseDir: string;
    user: string;
    password: string;
    port: number;
    persistent: boolean;
    onLog?: (message: unknown) => void;
    onError?: (message: unknown) => void;
  }

  export default class EmbeddedPostgres {
    constructor(options: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
  }
}
