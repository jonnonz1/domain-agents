export class Database {
  private connectionString: string;

  constructor(connectionString: string) {
    this.connectionString = connectionString;
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return [];
  }

  async close(): Promise<void> {
    // Close pool
  }
}
