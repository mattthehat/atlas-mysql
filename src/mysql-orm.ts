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
 * Field value type - either a column name (string), raw SQL, or a subquery
 */
export type FieldValue = string | { raw: string } | QueryConfig;

/**
 * Order by configuration - either a column name or an object with column and direction
 */
export type OrderByConfig =
  | string
  | Array<string>
  | Array<{ column: string; direction?: 'ASC' | 'DESC' }>;

/**
 * Query configuration interface for building dynamic SQL queries
 */
export type QueryConfig = {
  /** Field mappings from query alias to database column */
  fields: {
    [key: string]: FieldValue;
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
  /** WHERE IN clause conditions */
  whereIn?: {
    [key: string]: Array<string | number | boolean | null>;
  };
  /** WHERE NOT IN clause conditions */
  whereNotIn?: {
    [key: string]: Array<string | number | boolean | null>;
  };
  /** HAVING clause conditions (supports operators like >, <, >=, <=, =) */
  having?: Array<string>;
  /** Maximum number of records to return */
  limit?: number;
  /** Number of records to skip */
  offset?: number;
  /** ORDER BY field(s) - supports aliases */
  orderBy?: OrderByConfig;
  /** Sort direction (only used when orderBy is string or string[]) */
  orderDirection?: 'ASC' | 'DESC';
  /** GROUP BY field(s) */
  groupBy?: Array<string> | string;
  /** UNION queries */
  union?: Array<QueryConfig>;
  /** Use DISTINCT in SELECT */
  distinct?: boolean;
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
 * Configuration for JSON object serialization
 */
export interface JsonObject {
  [key: string]: string | number | null | JsonObject;
}

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
   * Resolve alias to actual column name
   * @param fieldOrAlias Field name or alias from fields map
   * @param config Query configuration
   * @returns Actual column name
   */
  private resolveColumnName(fieldOrAlias: string, config: QueryConfig): string {
    // First check if it's an alias in fields map
    const fieldValue = config.fields[fieldOrAlias];
    if (fieldValue && typeof fieldValue === 'string') {
      return fieldValue;
    }

    // Otherwise assume it's already a column name
    return fieldOrAlias;
  }

  /**
   * Resolve aliases in WHERE clause
   * @param clause WHERE clause string
   * @param config Query configuration
   * @returns Resolved WHERE clause with actual column names
   */
  private resolveWhereClause(clause: string, config: QueryConfig): string {
    // Match field names before operators
    // Supports: =, !=, <, >, <=, >=, <=>, LIKE, NOT LIKE, IN, NOT IN, IS NULL, IS NOT NULL, BETWEEN
    const fieldPattern =
      /^(\w+(?:\.\w+)?)\s*(=|!=|<>|<|>|<=|>=|<=>|LIKE|NOT LIKE|IN|NOT IN|IS NULL|IS NOT NULL|BETWEEN)/i;
    const match = clause.match(fieldPattern);

    if (match && match[1]) {
      const fieldName = match[1];
      const resolvedField = this.resolveColumnName(fieldName, config);
      return clause.replace(fieldName, resolvedField);
    }

    return clause;
  }

  /**
   * Resolve aliases in ORDER BY column
   * @param column ORDER BY column string
   * @param config Query configuration
   * @returns Resolved column name
   */
  private resolveOrderByColumn(column: string, config: QueryConfig): string {
    // Remove ASC/DESC if included
    const cleanColumn = column.replace(/\s+(ASC|DESC)$/i, '').trim();
    const direction = column.match(/\s+(ASC|DESC)$/i)?.[1] || '';

    const resolvedColumn = this.resolveColumnName(cleanColumn, config);
    return direction ? `${resolvedColumn} ${direction}` : resolvedColumn;
  }

  /**
   * Validate JOIN ON clause to prevent SQL injection
   * @param onClause The ON clause to validate
   * @throws Error if ON clause appears to contain user input or dangerous patterns
   */
  private validateJoinOnClause(onClause: string): void {
    // Check for potential SQL injection patterns
    const dangerousPatterns = [
      /;/g, // Multiple statements
      /--/g, // SQL comments
      /\/\*/g, // Block comments
      /\bUNION\b/i,
      /\bDROP\b/i,
      /\bDELETE\b/i,
      /\bINSERT\b/i,
      /\bUPDATE\b/i,
      /\bEXEC\b/i,
      /\bEXECUTE\b/i,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(onClause)) {
        throw new Error(
          `Invalid JOIN ON clause: potentially dangerous pattern detected. ON clauses must only contain column comparisons.`
        );
      }
    }
  }

  /**
   * Build SQL query from QueryConfig
   * @param config Query configuration
   * @param isCount Whether to build a count query
   * @returns Generated SQL query string and parameter values for whereIn/having
   */
  private buildQuery(
    config: QueryConfig,
    isCount = false
  ): { query: string; additionalValues: Array<string | number | boolean | null> } {
    const {
      fields,
      table,
      joins,
      where,
      whereIn,
      whereNotIn,
      having,
      limit,
      offset,
      orderBy,
      groupBy,
      idField,
      orderDirection,
      union,
      distinct,
    } = config;

    let query = '';
    const additionalValues: Array<string | number | boolean | null> = [];

    if (isCount) {
      const distinctKeyword = distinct ? 'DISTINCT ' : '';
      query += `SELECT COUNT(${distinctKeyword}${escapeId(idField)}) AS count FROM ${
        Array.isArray(table) ? table.map((t) => escapeId(t)).join(', ') : escapeId(table)
      }`;
    } else {
      query += distinct ? 'SELECT DISTINCT ' : 'SELECT ';

      for (const key in fields) {
        const fieldValue = fields[key];

        if (this.isObject(fieldValue) && !('raw' in fieldValue)) {
          // Handle subquery
          const subQueryResult = this.buildQuery(fieldValue as QueryConfig, false);
          query += `(${subQueryResult.query}) AS ${escapeId(key)}, `;
          // Note: subquery values are handled within the subquery itself
        } else if (
          typeof fieldValue === 'object' &&
          fieldValue !== null &&
          'raw' in fieldValue &&
          typeof fieldValue.raw === 'string'
        ) {
          // Handle explicit raw SQL marker
          query += `${fieldValue.raw} AS ${escapeId(key)}, `;
        } else if (typeof fieldValue === 'string') {
          // Check if the field value contains SQL functions or is already escaped
          if (fieldValue.includes('(') || fieldValue.includes('`') || fieldValue.includes("'")) {
            query += `${fieldValue} AS ${escapeId(key)}, `;
          } else {
            query += `${escapeId(fieldValue)} AS ${escapeId(key)}, `;
          }
        } else {
          query += `${escapeId(String(fieldValue))} AS ${escapeId(key)}, `;
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
        // Validate JOIN ON clause for security
        this.validateJoinOnClause(join.on);
        query += ` ${join.type.toUpperCase()} JOIN ${escapeId(join.table)} ON ${join.on}`;
      });
    }

    // Build WHERE clause with proper handling of where, whereIn, and whereNotIn
    const whereClauses: string[] = [];

    if (where && where.length > 0) {
      // Resolve aliases in WHERE clauses
      const resolvedWhere = where.map((clause) => this.resolveWhereClause(clause, config));
      whereClauses.push(...resolvedWhere);
    }

    if (whereIn) {
      Object.keys(whereIn).forEach((key) => {
        const values = whereIn[key];
        if (values && values.length > 0) {
          // Resolve alias for whereIn key
          const resolvedKey = this.resolveColumnName(key, config);
          whereClauses.push(`${escapeId(resolvedKey)} IN (${values.map(() => '?').join(', ')})`);
          additionalValues.push(...values);
        }
      });
    }

    if (whereNotIn) {
      Object.keys(whereNotIn).forEach((key) => {
        const values = whereNotIn[key];
        if (values && values.length > 0) {
          // Resolve alias for whereNotIn key
          const resolvedKey = this.resolveColumnName(key, config);
          whereClauses.push(
            `${escapeId(resolvedKey)} NOT IN (${values.map(() => '?').join(', ')})`
          );
          additionalValues.push(...values);
        }
      });
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (groupBy) {
      query += ` GROUP BY ${
        Array.isArray(groupBy) ? groupBy.map((g) => escapeId(g)).join(', ') : escapeId(groupBy)
      }`;
    }

    if (having && having.length > 0) {
      // Enhanced HAVING with operator support (similar to WHERE)
      query += ` HAVING ${having.join(' AND ')}`;
      // Note: HAVING values should be included in the main query values array by the caller
    }

    // Enhanced ORDER BY with support for multiple directions and alias resolution
    if (orderBy) {
      const orderByClauses: string[] = [];

      if (Array.isArray(orderBy)) {
        orderBy.forEach((item) => {
          if (typeof item === 'string') {
            // Simple string: resolve alias
            const resolvedColumn = this.resolveOrderByColumn(item, config);
            orderByClauses.push(escapeId(resolvedColumn));
          } else if (typeof item === 'object' && 'column' in item) {
            // Object with column and direction
            const resolvedColumn = this.resolveColumnName(item.column, config);
            const dir = item.direction?.toUpperCase() || 'ASC';
            orderByClauses.push(`${escapeId(resolvedColumn)} ${dir}`);
          }
        });
      } else if (typeof orderBy === 'string') {
        // Single string: resolve alias
        const resolvedColumn = this.resolveOrderByColumn(orderBy, config);
        orderByClauses.push(escapeId(resolvedColumn));
      }

      if (orderByClauses.length > 0) {
        query += ` ORDER BY ${orderByClauses.join(', ')}`;

        // Only apply global orderDirection if orderBy is a string or string array
        if (orderDirection && typeof orderBy === 'string') {
          query += ` ${orderDirection.toUpperCase()}`;
        } else if (
          orderDirection &&
          Array.isArray(orderBy) &&
          orderBy.every((item) => typeof item === 'string')
        ) {
          // Replace the ORDER BY clause to add direction to all columns
          const columnsWithDirection = (orderBy as string[]).map((col) => {
            const resolvedColumn = this.resolveOrderByColumn(col, config);
            return `${escapeId(resolvedColumn)} ${orderDirection.toUpperCase()}`;
          });
          query = query.replace(
            /ORDER BY .+?(?= LIMIT| OFFSET| UNION|$)/,
            `ORDER BY ${columnsWithDirection.join(', ')}`
          );
        }
      }
    } else {
      query += ` ORDER BY ${escapeId(config.idField)} ASC`;
    }

    if (isCount) {
      query += ` LIMIT 1`;
    } else {
      if (limit) {
        const safeLimit = Math.max(1, Math.floor(Math.abs(limit)));
        query += ` LIMIT ${safeLimit}`;
      }
      // No default LIMIT - users must explicitly specify if they want one
    }

    if (offset && !isCount) {
      const safeOffset = Math.max(0, Math.floor(Math.abs(offset)));
      query += ` OFFSET ${safeOffset}`;
    }

    if (union && union.length > 0) {
      union.forEach((u) => {
        const unionResult = this.buildQuery(u);
        query += ` UNION ${unionResult.query}`;
        additionalValues.push(...unionResult.additionalValues);
      });
    }

    if (this.isDev) {
      console.log(chalk.blue('Generated Query:'), chalk.magentaBright(query));
    }

    return { query, additionalValues };
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
      const queryResult = this.buildQuery(query);
      const countQueryResult = this.buildQuery(query, true);

      // Combine user-provided values with additional values from whereIn/having
      const allValues = [...values, ...queryResult.additionalValues];
      const allCountValues = [...values, ...countQueryResult.additionalValues];

      if (this.isDev) {
        console.log(chalk.cyan('Values:'), allValues);
      }

      const [rowsResult, countRowsResult] = await Promise.all([
        this.pool.query(queryResult.query, allValues),
        this.pool.query(countQueryResult.query, allCountValues),
      ]);

      const [rows] = rowsResult;
      const [countRows] = countRowsResult;

      const duration = Date.now() - startTime;
      queryLogger.logQuery(queryResult.query, allValues, duration);

      const countResult = (countRows as Array<{ count: number }>)[0];
      return {
        rows: rows as T[],
        count: countResult?.count || 0,
      };
    } catch (error) {
      const queryResult = this.buildQuery(query);
      const allValues = [...values, ...queryResult.additionalValues];
      if (error instanceof Error) {
        queryLogger.logError(queryResult.query, error, allValues);
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
    const queryResult = this.buildQuery(query);

    // Combine user-provided values with additional values from whereIn/having
    const allValues = [...values, ...queryResult.additionalValues];

    if (this.isDev) {
      console.log(chalk.cyan('Values:'), allValues);
    }

    try {
      const [rows] = await this.pool.query(queryResult.query, allValues);

      const duration = Date.now() - startTime;
      queryLogger.logQuery(queryResult.query, allValues, duration);

      return (rows as T[])[0] || null;
    } catch (error) {
      if (error instanceof Error) {
        queryLogger.logError(queryResult.query, error, allValues);
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
   * Batch insert multiple records into database
   * @param table Table name
   * @param data Array of data objects to insert
   * @param transaction Optional transaction instance
   * @returns Promise resolving to array of insert IDs
   */
  public async batchInsertData(
    table: string,
    data: Array<{ [k: string]: string | number | boolean | null }>,
    transaction?: Transaction
  ): Promise<number[]> {
    if (!data || data.length === 0) {
      return [];
    }

    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    // Get keys from first object (assumes all objects have same structure)
    const firstItem = data[0];
    if (!firstItem) {
      return [];
    }
    const keys = Object.keys(firstItem);

    // Build values array - flatten all values
    const allValues: Array<string | number | boolean | null> = [];
    data.forEach((item) => {
      keys.forEach((key) => {
        const value = item[key];
        if (value !== undefined) {
          allValues.push(value);
        }
      });
    });

    // Build query with multiple value sets
    const valuePlaceholders = data.map(() => `(${keys.map(() => '?').join(', ')})`).join(', ');
    const query = `INSERT INTO ${escapeId(table)} (${keys
      .map((k) => escapeId(k))
      .join(', ')}) VALUES ${valuePlaceholders}`;

    if (this.isDev) {
      console.log(chalk.blue('Batch Insert Query:'), query);
      console.log(chalk.cyan('Value Count:'), allValues.length);
    }

    try {
      const connection = transaction?.getConnection() ?? this.pool;
      const [result] = await connection.query<ResultSetHeader>(query, allValues);

      const duration = Date.now() - startTime;
      queryLogger.logQuery(query, allValues, duration);

      // Generate array of insert IDs
      const insertIds: number[] = [];
      const firstId = result.insertId;
      for (let i = 0; i < data.length; i++) {
        insertIds.push(firstId + i);
      }

      return insertIds;
    } catch (error) {
      if (error instanceof Error) {
        queryLogger.logError(query, error, allValues);
      }

      if (error instanceof Error && this.isDev) {
        throw new Error(`Failed to batch insert data: ${error.message}`);
      } else {
        throw new Error('Failed to batch insert data: Database error occurred');
      }
    }
  }

  /**
   * Update existing records in database
   * @param config Update configuration
   * @param transaction Optional transaction instance
   * @returns Promise resolving to number of affected rows
   */
  public async updateData(
    config: UpdateDataConfig,
    transaction?: Transaction
  ): Promise<number> {
    const queryLogger = getQueryLogger();
    const startTime = Date.now();

    const { table, data, where, values } = config;

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
   * @description Generates SQL for JSON object aggregation using MySQL's JSON_OBJECT function
   * Keys are string literals, values are column references or nested JSON_OBJECT calls
   * @returns string
   */
  public getJsonSql(config: JsonObject): string {
    let sql = 'JSON_OBJECT(';
    const entries = Object.entries(config);
    entries.forEach(([key, value], index) => {
      // Keys in JSON_OBJECT are string literals
      sql += `'${key}', `;
      if (this.isObject(value)) {
        // Nested JSON object
        sql += this.getJsonSql(value);
      } else {
        // Value is a column reference - use escapeId for column names
        sql += `${escapeId(String(value))}`;
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
   * @description Generates SQL for JSON array aggregation using MySQL's JSON_ARRAYAGG function
   * Note: MySQL uses JSON_ARRAYAGG, not JSON_AGG (which is PostgreSQL syntax)
   * @returns string
   */
  public getJsonArraySql(config: Array<JsonObject>): string {
    let sql = 'JSON_ARRAYAGG(';
    const values = Object.values(config);

    values.forEach((value, index) => {
      if (this.isObject(value)) {
        sql += this.getJsonSql(value);
      } else {
        // Value is a column reference
        sql += `${escapeId(String(value))}`;
      }
      if (index < values.length - 1) {
        sql += ', ';
      }
    });
    sql += ')';
    return sql;
  }

  /**
   *
   * @param obj any
   * @description Type guard to check if value is a plain object (not array, null, or other types)
   * @returns bool
   */
  public isObject(obj: any): obj is Record<string, any> {
    return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
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
