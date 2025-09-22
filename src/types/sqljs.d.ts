declare module 'sql.js' {
  // Minimal typings for sql.js used by our migration script
  export interface SqlJsStatic {
    Database: {
      new (data?: Uint8Array): Database;
    };
  }
  export interface QueryResult {
    columns: string[];
    values: unknown[][];
  }
  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): QueryResult[];
    export(): Uint8Array;
    close(): void;
  }
  export default function initSqlJs(config?: unknown): Promise<SqlJsStatic>;
}
