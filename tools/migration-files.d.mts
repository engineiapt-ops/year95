import type { MigrationPlan } from '../packages/persistence/src/migrate.js';

export declare function loadMigrationPlan(rootDir: string): Promise<MigrationPlan>;
