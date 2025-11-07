/**
 * QueryCraft MySQL - A powerful, type-safe MySQL ORM for Node.js
 *
 * @packageDocumentation
 */

// Export main ORM class and types
export {
  MySQLORM,
  Transaction,
  createMySQLORMFromEnv,
  type MySQLORMConfig,
  type QueryConfig,
  type CreateTableConfig,
} from './mysql-orm';

// Export query logger functionality
export {
  QueryLogger,
  getQueryLogger,
  initialiseQueryLogger,
  closeQueryLogger,
  createQueryLogger,
  type QueryLoggerConfig,
  type QueryLogEntry,
  type LogLevel,
} from './query-logger';

// Default export for convenience
export { MySQLORM as default } from './mysql-orm';
