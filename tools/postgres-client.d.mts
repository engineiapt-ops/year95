import type {
  MigrationDatabase,
  SqlStatement,
  SqlValue,
} from '../packages/persistence/src/migrate.js';

export declare class PsqlDatabaseClient implements MigrationDatabase {
  constructor(options: { connectionString: string; schemaName?: string; readOnly?: boolean });
  queryRows<Row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: readonly SqlValue[],
  ): Promise<readonly Row[]>;
  transaction(statements: readonly SqlStatement[]): Promise<void>;
}
