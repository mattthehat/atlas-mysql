import mysql, { type ResultSetHeader, escapeId, escape, type PoolConnection } from 'mysql2/promise';
import chalk from 'chalk';
import { getQueryLogger } from './query-logger';

/**
 * MySQL ORM Configuration interface
 */
export interface MySQLORMConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number;
  connectionLimit?: number;
  maxIdle?: number;
  idleTimeout?: number;
  queueLimit?: number;
  enableKeepAlive?: boolean;
  keepAliveInitialDelay?: number;
}

/**
 * Query configuration interface for building dynamic SQL queries
 */
export type QueryConfig = {
  /** Field mappings from query alias to database column */
  fields: {
    [key: string]: string | number | boolean | null | QueryConfig;
  };
  /** Primary identifier field name */
  idField: string;
  /** Table name(s) to query from */
  table: Array<string> | string;
  /** JOIN clauses configuration */
  joins?: Array<{
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
    table: string;
    on: string;
  }>;
  /** WHERE clause conditions */
  where?: Array<string>;
  /** WHERE NOT clause conditions */
  whereNot?: Array<string>;
  /** HAVING clause conditions */
  having?: {
    [key: string]: string | number | boolean | null;
  };
  /** Maximum number of records to return */
  limit?: number;
  /** Number of records to skip */
  offset?: number;
  /** ORDER BY field(s) */
  orderBy?: Array<string> | string;
  /** Sort direction */
  orderDirection?: 'ASC' | 'DESC';
  /** GROUP BY field(s) */
  groupBy?: Array<string> | string;
  /** UNION queries */
  union?: Array<QueryConfig>;
};

/**
 * MySQL column types supported by the ORM
 */
type ColumnType =
  | 'int'
  | 'varchar'
  | 'text'
  | 'timestamp'
  | 'datetime'
  | 'date'
  | 'float'
  | 'double'
  | 'decimal'
  | 'json'
  | 'enum'
  | 'set'
  | 'binary'
  | 'varbinary'
  | 'tinyint'
  | 'smallint'
  | 'mediumint'
  | 'bigint'
  | 'char'
  | 'tinytext'
  | 'mediumtext'
  | 'longtext'
  | 'blob'
  | 'tinyblob'
  | 'mediumblob'
  | 'longblob'
  | 'bit'
  | 'bool'
  | 'boolean'
  | 'year'
  | 'time'
  | 'geometry'
  | 'point'
  | 'linestring'
  | 'polygon'
  | 'multipoint'
  | 'multilinestring'
  | 'multipolygon'
  | 'geometrycollection';

/**
 * Column options for table creation
 */
type ColumnOptions = {
  length?: number;
  default?: string | number | boolean | null;
  nullable?: boolean;
  autoIncrement?: boolean;
  unsigned?: boolean;
  zerofill?: boolean;
  charset?: string;
  collate?: string;
  comment?: string;
  onUpdate?: string;
  generated?: {
    expression: string;
    type: 'VIRTUAL' | 'STORED';
  };
  enum?: string[];
};

/**
 * Table options for table creation
 */
type TableOptions = {
  engine?: string;
  autoIncrement?: number;
  rowFormat?: 'DEFAULT' | 'DYNAMIC' | 'COMPRESSED' | 'REDUNDANT' | 'COMPACT';
  charset?: string;
  collate?: string;
  comment?: string;
};

/**
 * Index configuration
 */
type Index = {
  type?: 'UNIQUE' | 'FULLTEXT' | 'SPATIAL';
  columns: string[];
};

/**
 * Partition configuration
 */
type Partition = {
  type: 'RANGE' | 'LIST' | 'HASH' | 'KEY';
  column: string;
  partitions: number;
};

/**
 * Foreign key constraint configuration
 */
type ForeignKey = {
  column: string;
  reference: string;
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
};

/**
 * Check constraint configuration
 */
type CheckConstraint = {
  name: string;
  condition: string;
};

/**
 * Configuration for creating database tables
 */
export type CreateTableConfig = {
  table: string;
  columns: Array<{ name: string; type: ColumnType; options?: ColumnOptions }>;
  primaryKey: string | string[];
  foreignKeys?: ForeignKey[];
  indexes?: Index[];
  checks?: CheckConstraint[];
  partition?: Partition;
  tableOptions?: TableOptions;
  dropIfExists?: boolean;
};

/**
 * Update data configuration
 */
type UpdateDataConfig = {
  table: string;
  data: { [k: string]: string | number | boolean | null };
  where: Array<string>;
  values?: Array<string | number | boolean | null>;
};

/**
 * MySQL ORM class providing database operations and query building
 */
export class MySQLORM {
  private pool: mysql.Pool;
  private isDev: boolean;

  /**
   * Initialise MySQL ORM with configuration
   * @param config MySQL connection configuration
   */
  constructor(config: MySQLORMConfig) {
    this.isDev = process.env.NODE_ENV === 'development';

    this.pool = mysql.createPool({
      host: config.host,
      user: config.user,
      database: config.database,
      password: config.password,
      port: config.port || 3306,
      waitForConnections: true,
      connectionLimit: config.connectionLimit || 10,
      maxIdle: config.maxIdle || 10,
      idleTimeout: config.idleTimeout || 60000,
      queueLimit: config.queueLimit || 0,
      enableKeepAlive: config.enableKeepAlive || true,
      keepAliveInitialDelay: config.keepAliveInitialDelay || 0,
      typeCast: function (field, next: () => any) {
        if (field.type === 'TINY') {
          return field.string() === '1'; // 1 = true, 0 = false
        }
        return next();
      },
    });
  }

  /**
   * Build SQL query from QueryConfig
   * @param config Query configuration
   * @param isCount Whether to build a count query
   * @returns Generated SQL query string
   */
  private buildQuery(config: QueryConfig, isCount = false): string {
    const {
      fields,
      table,
      joins,
      where,
      having,
      limit,
      offset,
      orderBy,
      groupBy,
      idField,
      orderDirection,
      union,
    } = config;

    let query = '';

    if (isCount) {
      query += `SELECT COUNT(${escapeId(idField)}) AS count FROM ${
        Array.isArray(table) ? table.map((t) => escapeId(t)).join(', ') : escapeId(table)
      }`;
    } else {
      query += `SELECT `;

      for (const key in fields) {
        if (this.isObject(fields[key])) {
          const subQuery = this.buildQuery(fields[key] as QueryConfig, false);
          query += `(${subQuery}) AS ${escapeId(key)}, `;
        } else {
          const fieldValue = fields[key];
          // Check if the field value contains SQL functions or is already escaped
          if (
            typeof fieldValue === 'string' &&
            (fieldValue.includes('(') || fieldValue.includes('`') || fieldValue.includes("'"))
          ) {
            query += `${fieldValue} AS ${escapeId(key)}, `;
          } else {
            query += `${escapeId(String(fieldValue))} AS ${escapeId(key)}, `;
          }
        }
      }

      // Remove the last comma and space
      query = query.slice(0, -2);

      query += ` FROM ${
        Array.isArray(table) ? table.map((t) => escapeId(t)).join(', ') : escapeId(table)
      }`;
    }

    if (joins) {
      joins.forEach((join) => {
        query += ` ${join.type.toUpperCase()} JOIN ${escapeId(join.table)} ON ${join.on}`;
      });
    }

    if (where && where.length > 0) {
      query += ` WHERE ${where.join(' AND ')}`;
    }

    if (config.whereNot && config.whereNot.length > 0) {
      query += ` WHERE NOT ${config.whereNot.join(' AND ')}`;
    }

    if (having) {
      query += ` HAVING ${Object.keys(having)
        .map((key) => `${escapeId(key)} = ?`)
        .join(' AND ')}`;
    }

    if (groupBy) {
      query += ` GROUP BY ${
        Array.isArray(groupBy) ? groupBy.map((g) => escapeId(g)).join(', ') : escapeId(groupBy)
      }`;
    }

    if (orderBy) {
      query += ` ORDER BY ${
        Array.isArray(orderBy) ? orderBy.map((o) => escapeId(o)).join(', ') : escapeId(orderBy)
      }`;
    } else {
      query += ` ORDER BY ${escapeId(config.idField)}`;
    }

    const direction = orderDirection?.toUpperCase() || 'ASC';
    query += ` ${direction}`;

    if (isCount) {
      query += ` LIMIT 1`;
    } else {
      if (limit) {
        const safeLimit = Math.max(1, Math.floor(Math.abs(limit)));
        query += ` LIMIT ${safeLimit}`;
      } else {
        query += ' LIMIT 10';
      }
    }

    if (offset && !isCount) {
      const safeOffset = Math.max(0, Math.floor(Math.abs(offset)));
      query += ` OFFSET ${safeOffset}`;
    }

    if (union && union.length > 0) {
      union.forEach((u) => {
        query += ` UNION ${this.buildQuery(u)}`;
      });
    }

    if (this.isDev) {
      console.log(chalk.blue('Generated Query:'), chalk.magentaBright(query));
    }

    return query;
  }

  /**
   * Get multiple records with count
   * @param query Query configuration
   * @param values Parameter values for prepared statement
   * @returns Promise resolving to rows and total count
   */
  public async getData<T extends Record<string, any>>(
    query: QueryConfig,
    values: Array<string | number | boolean | null> = []
  ): Promise<{ rows: T[]; count: number }> {
    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    try {
      const queryStr = this.buildQuery(query);
      const countQueryStr = this.buildQuery(query, true);

      if (this.isDev) {
        console.log(chalk.cyan('Values:'), values);
      }

      const [rowsResult, countRowsResult] = await Promise.all([
        this.pool.query(queryStr, values),
        this.pool.query(countQueryStr, values),
      ]);

      const [rows] = rowsResult;
      const [countRows] = countRowsResult;

      const duration = Date.now() - startTime;
      queryLogger.logQuery(queryStr, values, duration);

      const countResult = (countRows as Array<{ count: number }>)[0];
      return {
        rows: rows as T[],
        count: countResult?.count || 0,
      };
    } catch (error) {
      const queryStr = this.buildQuery(query);
      if (error instanceof Error) {
        queryLogger.logError(queryStr, error, values);
      }

      console.error('Error in getData:', error);
      if (error instanceof Error && this.isDev) {
        throw new Error(`Failed to fetch data: ${error.message}`);
      } else {
        throw new Error('Failed to fetch data: Database error occurred');
      }
    }
  }

  /**
   * Get the first matching record
   * @param query Query configuration
   * @param values Parameter values for prepared statement
   * @returns Promise resolving to first matching record or null
   */
  public async getFirst<T extends Record<string, any>>(
    query: QueryConfig,
    values: Array<string | number | boolean | null> = []
  ): Promise<T | null> {
    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    query.limit = 1;
    const queryStr = this.buildQuery(query);

    if (this.isDev) {
      console.log(chalk.cyan('Values:'), values);
    }

    try {
      const [rows] = await this.pool.query(queryStr, values);

      const duration = Date.now() - startTime;
      queryLogger.logQuery(queryStr, values, duration);

      return (rows as T[])[0] || null;
    } catch (error) {
      if (error instanceof Error) {
        queryLogger.logError(queryStr, error, values);
      }

      console.error('Error in getFirst:', error);
      if (error instanceof Error && this.isDev) {
        throw new Error(`Failed to fetch data: ${error.message}`);
      } else {
        throw new Error('Failed to fetch data: Database error occurred');
      }
    }
  }

  /**
   * Insert new record into database
   * @param table Table name
   * @param data Data to insert
   * @param transaction Optional transaction instance
   * @returns Promise resolving to insert ID
   */
  public async insertData(
    table: string,
    data: { [k: string]: string | number | boolean | null },
    transaction?: Transaction
  ): Promise<number> {
    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    const keys = Object.keys(data);
    const values = Object.values(data);

    const query = `INSERT INTO ${escapeId(table)} (${keys
      .map((k) => escapeId(k))
      .join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;

    if (this.isDev) {
      console.log(chalk.blue('Insert Query:'), query);
      console.log(chalk.cyan('Values:'), values);
    }

    try {
      const connection = transaction?.getConnection() ?? this.pool;
      const [result] = await connection.query<ResultSetHeader>(query, values);

      const duration = Date.now() - startTime;
      queryLogger.logQuery(query, values, duration);

      return result.insertId;
    } catch (error) {
      if (error instanceof Error) {
        queryLogger.logError(query, error, values);
      }

      if (error instanceof Error && this.isDev) {
        throw new Error(`Failed to insert data: ${error.message}`);
      } else {
        throw new Error('Failed to insert data: Database error occurred');
      }
    }
  }

  /**
   * Update existing records in database
   * @param config Update configuration
   * @returns Promise resolving to number of affected rows
   */
  public async updateData(
    config: UpdateDataConfig & { transaction?: Transaction }
  ): Promise<number> {
    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    const { table, data, where, values, transaction } = config;

    const setKeys = Object.keys(data);
    const setValues = Object.values(data);

    const query = `UPDATE ${escapeId(table)} SET ${setKeys
      .map((k) => `${escapeId(k)} = ?`)
      .join(', ')} WHERE ${where.join(' AND ')}`;

    const allValues = [...setValues, ...(values || [])];

    if (this.isDev) {
      console.log(chalk.blue('Update Query:'), query);
      console.log(chalk.cyan('Values:'), allValues);
    }

    try {
      const connection = transaction?.getConnection() ?? this.pool;
      const [result] = await connection.query<ResultSetHeader>(query, allValues);

      const duration = Date.now() - startTime;
      queryLogger.logQuery(query, allValues, duration);

      return result.affectedRows;
    } catch (error) {
      if (error instanceof Error) {
        queryLogger.logError(query, error, allValues);
      }

      if (error instanceof Error && this.isDev) {
        throw new Error(`Failed to update data: ${error.message}`);
      } else {
        throw new Error('Failed to update data: Database error occurred');
      }
    }
  }

  /**
   * Delete records from database
   * @param table Table name
   * @param where Where conditions as key-value pairs
   * @param transaction Optional transaction instance
   * @returns Promise resolving to number of affected rows
   */
  public async deleteData(
    table: string,
    where: { [k: string]: string | number | boolean | null },
    transaction?: Transaction
  ): Promise<number> {
    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);

    const query = `DELETE FROM ${escapeId(table)} WHERE ${whereKeys
      .map((k) => `${escapeId(k)} = ?`)
      .join(' AND ')}`;

    if (this.isDev) {
      console.log(chalk.blue('Delete Query:'), query);
      console.log(chalk.cyan('Values:'), whereValues);
    }

    try {
      const connection = transaction?.getConnection() ?? this.pool;
      const [result] = await connection.query<ResultSetHeader>(query, whereValues);

      const duration = Date.now() - startTime;
      queryLogger.logQuery(query, whereValues, duration);

      return result.affectedRows;
    } catch (error) {
      if (error instanceof Error) {
        queryLogger.logError(query, error, whereValues);
      }

      if (error instanceof Error && this.isDev) {
        throw new Error(`Failed to delete data: ${error.message}`);
      } else {
        throw new Error('Failed to delete data: Database error occurred');
      }
    }
  }

  /**
   * Execute raw SQL query
   * @param query SQL query string
   * @param values Parameter values for prepared statement
   * @param transaction Optional transaction instance
   * @returns Promise resolving to query results
   */
  public async rawQuery<T>(
    query: string,
    values: Array<string | number | boolean | null> = [],
    transaction?: Transaction
  ): Promise<T[]> {
    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    try {
      const connection = transaction?.getConnection() ?? this.pool;
      const [rows] = await connection.query(query, values);

      const duration = Date.now() - startTime;
      queryLogger.logQuery(query, values, duration);

      return rows as T[];
    } catch (error) {
      if (error instanceof Error) {
        queryLogger.logError(query, error, values);
      }

      console.error('Error in rawQuery:', error);
      throw new Error('Failed to execute raw query');
    }
  }

  /**
   *
   * @param config object
   * @returns string
   */
  public getJsonSql(config: Record<string, any>): string {
    let sql = 'JSON_OBJECT(';
    const entries = Object.entries(config);
    entries.forEach(([key, value], index) => {
      sql += `${escape(key)}, `;
      if (typeof value === 'object' && value !== null) {
        sql += this.getJsonSql(value);
      } else {
        sql += `${escape(value)}`;
      }
      if (index < entries.length - 1) {
        sql += ', ';
      }
    });
    sql += ')';
    return sql;
  }

  /**
   *
   * @param config Array<object>
   * @returns string
   */
  public getJsonArraySql(config: Array<Record<string, any>>): string {
    let sql = 'JSON_AGG(';
    const values = Object.values(config);

    values.forEach((value, index) => {
      if (typeof value === 'object' && value !== null) {
        sql += this.getJsonSql(value);
      } else {
        sql += `${escape(value)}`;
      }
      if (index < values.length - 1) {
        sql += ', ';
      }
    });
    sql += ')';
    return sql;
  }

  public isObject(obj: any): obj is Record<string, any> {
    return obj === Object(obj);
  }

  /**
   * Create database table
   * @param config Table creation configuration
   * @returns Promise resolving when table is created
   */
  public async createTable(config: CreateTableConfig): Promise<void> {
    try {
      const { table, columns, primaryKey, foreignKeys, indexes, tableOptions, dropIfExists } =
        config;

      let query = ``;

      if (dropIfExists) {
        const dropQuery = `DROP TABLE IF EXISTS ${escapeId(table)}`;
        if (this.isDev) {
          console.log('Executing Drop Query:', dropQuery);
        }
        await this.pool.query(dropQuery);
      }

      query += `CREATE TABLE ${escapeId(table)} (`;

      columns.forEach((column, index) => {
        query += `${escapeId(column.name)} `;

        // Handle ENUM type specially
        if (column.type.toLowerCase() === 'enum' && column.options?.enum) {
          query += `ENUM(${column.options.enum.map((val) => escape(val)).join(', ')})`;
        } else {
          query += column.type.toUpperCase();

          if (column.options?.length) {
            query += `(${column.options.length})`;
          }
        }

        if (column.options) {
          const {
            unsigned,
            zerofill,
            charset,
            collate,
            nullable,
            default: defaultValue,
            autoIncrement,
            comment,
            onUpdate,
          } = column.options;

          if (unsigned) query += ' UNSIGNED';
          if (zerofill) query += ' ZEROFILL';

          // Character set and collation for text types
          if (
            ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'].includes(
              column.type.toLowerCase()
            )
          ) {
            if (charset) query += ` CHARACTER SET ${charset}`;
            if (collate) query += ` COLLATE ${collate}`;
          }

          query += nullable !== false ? ' NULL' : ' NOT NULL';

          if (defaultValue !== undefined) {
            if (defaultValue === 'CURRENT_TIMESTAMP') {
              query += ` DEFAULT CURRENT_TIMESTAMP`;
            } else {
              query += ` DEFAULT ${
                typeof defaultValue === 'string' ? escape(defaultValue) : defaultValue
              }`;
            }
          }

          if (autoIncrement) query += ' AUTO_INCREMENT';
          if (onUpdate === 'CURRENT_TIMESTAMP') {
            query += ` ON UPDATE CURRENT_TIMESTAMP`;
          }
          if (comment) query += ` COMMENT ${escape(comment)}`;
        }

        if (index < columns.length - 1) {
          query += ', ';
        }
      });

      // Primary key
      if (Array.isArray(primaryKey)) {
        query += `, PRIMARY KEY (${primaryKey.map((key) => escapeId(key)).join(', ')})`;
      } else {
        query += `, PRIMARY KEY (${escapeId(primaryKey)})`;
      }

      // Indexes
      if (indexes) {
        indexes.forEach((index) => {
          if (index.type === 'UNIQUE') {
            query += `, UNIQUE KEY (${index.columns.map((col) => escapeId(col)).join(', ')})`;
          } else {
            query += `, ${index.type || ''} INDEX (${index.columns
              .map((col) => escapeId(col))
              .join(', ')})`;
          }
        });
      }

      // Foreign keys
      if (foreignKeys) {
        foreignKeys.forEach((fk) => {
          query += `, FOREIGN KEY (${escapeId(fk.column)}) REFERENCES ${fk.reference}`;
          if (fk.onDelete) query += ` ON DELETE ${fk.onDelete}`;
          if (fk.onUpdate) query += ` ON UPDATE ${fk.onUpdate}`;
        });
      }

      query += ')';

      // Table options
      if (tableOptions) {
        const {
          engine,
          autoIncrement,
          rowFormat,
          charset = 'utf8mb4',
          collate,
          comment,
        } = tableOptions;

        query += ` ENGINE=${engine || 'InnoDB'}`;
        if (autoIncrement) query += ` AUTO_INCREMENT=${autoIncrement}`;
        if (rowFormat) query += ` ROW_FORMAT=${rowFormat}`;
        if (charset) query += ` DEFAULT CHARACTER SET ${charset}`;
        if (collate) query += ` COLLATE ${collate}`;
        if (comment) query += ` COMMENT=${escape(comment)}`;
      } else {
        query += ` ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4`;
      }

      query += ';';

      if (this.isDev) {
        console.log('Generated Create Table Query:', query);
      }

      await this.pool.query(query);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to create table: ${error.message}`);
      }
      throw new Error('Failed to create table: Unknown error occurred');
    }
  }

  /**
   * Create a new transaction
   * @returns New Transaction instance
   */
  public createTransaction(): Transaction {
    return new Transaction(this.pool);
  }

  /**
   * Execute a function within a transaction
   * @param callback Function to execute within transaction
   * @returns Result of the callback
   */
  public async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    const transaction = this.createTransaction();

    try {
      await transaction.begin();
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      if (transaction.isActiveTransaction()) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /**
   * Close the connection pool
   */
  public async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Transaction class for handling database transactions
 */
export class Transaction {
  private connection: PoolConnection | null = null;
  private isActive: boolean = false;
  private pool: mysql.Pool;

  constructor(pool: mysql.Pool) {
    this.pool = pool;
  }

  /**
   * Begin a new transaction
   */
  async begin(): Promise<void> {
    if (this.isActive) {
      throw new Error('Transaction already started');
    }

    this.connection = await this.pool.getConnection();
    await this.connection.beginTransaction();
    this.isActive = true;

    if (process.env.NODE_ENV === 'development') {
      console.log(chalk.green('Transaction started'));
    }
  }

  /**
   * Commit the transaction
   */
  async commit(): Promise<void> {
    if (!this.isActive || !this.connection) {
      throw new Error('No active transaction to commit');
    }

    await this.connection.commit();
    this.connection.release();
    this.isActive = false;
    this.connection = null;

    if (process.env.NODE_ENV === 'development') {
      console.log(chalk.green('Transaction committed'));
    }
  }

  /**
   * Rollback the transaction
   */
  async rollback(): Promise<void> {
    if (!this.isActive || !this.connection) {
      throw new Error('No active transaction to rollback');
    }

    await this.connection.rollback();
    this.connection.release();
    this.isActive = false;
    this.connection = null;

    if (process.env.NODE_ENV === 'development') {
      console.log(chalk.yellow('Transaction rolled back'));
    }
  }

  /**
   * Get the transaction connection
   * @returns Database connection
   */
  getConnection(): PoolConnection {
    if (!this.isActive || !this.connection) {
      throw new Error('No active transaction');
    }
    return this.connection;
  }

  /**
   * Check if transaction is active
   * @returns True if transaction is active
   */
  isActiveTransaction(): boolean {
    return this.isActive;
  }
}

/**
 * Create a MySQL ORM instance from environment variables
 * @returns Configured MySQL ORM instance
 */
export function createMySQLORMFromEnv(): MySQLORM {
  const config: MySQLORMConfig = {
    user: process.env.DB_USER || '',
    password: process.env.DB_PASS || '',
    host: process.env.DB_HOST || '',
    database: process.env.DB_NAME || '',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 3306,
  };

  if (!config.user || !config.password || !config.host || !config.database) {
    throw new Error(
      'Database configuration is missing. Please set DB_USER, DB_PASS, DB_HOST, and DB_NAME environment variables.'
    );
  }

  return new MySQLORM(config);
}

// Convenience exports for backward compatibility and simpler usage
export { getQueryLogger, initialiseQueryLogger, closeQueryLogger } from './query-logger';
