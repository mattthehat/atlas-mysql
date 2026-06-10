/**
 * Atlas MySQL - A powerful, type-safe MySQL ORM for Node.js
 *
 * @packageDocumentation
 */

// Export main ORM class and types
export {
  MySQLORM,
  Transaction,
  createMySQLORMFromEnv,
  col,
  type MySQLORMConfig,
  type QueryConfig,
  type CreateTableConfig,
  type FieldValue,
  type TypedColumn,
  type FieldMap,
  type InferRow,
  type InferFieldValue,
  type ResolvedRow,
  type InferredQueryConfig,
  type WhereCondition,
  type WhereOperator,
  type WhereScalar,
  type WhereEntry,
  type OrderByConfig,
  type JsonObject,
  type VectorDistanceMetric,
  type VectorSearchConfig,
  type VectorSearchResult,
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
