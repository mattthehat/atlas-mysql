import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

/**
 * Log level enumeration
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Query log entry interface
 */
export type QueryLogEntry = {
  timestamp: string;
  level: LogLevel;
  query: string;
  values?: Array<string | number | boolean | null>;
  duration?: number;
  error?: string;
  stackTrace?: string;
};

/**
 * Query logger configuration interface
 */
export type QueryLoggerConfig = {
  /** Enable/disable query logging */
  enabled: boolean;
  /** Write logs to file */
  logToFile: boolean;
  /** Write logs to console */
  logToConsole: boolean;
  /** Path to log file */
  logFilePath: string;
  /** Threshold for marking queries as slow (in milliseconds) */
  slowQueryThreshold: number;
  /** Maximum log file size in bytes */
  maxFileSize: number;
  /** Enable log file rotation */
  rotateOnSize: boolean;
};

/**
 * Default query logger configuration
 */
const defaultConfig: QueryLoggerConfig = {
  enabled: process.env.QUERY_LOGGING_ENABLED === 'true',
  logToFile: process.env.QUERY_LOG_TO_FILE !== 'false', // true by default
  logToConsole: process.env.NODE_ENV === 'development',
  logFilePath: process.env.QUERY_LOG_PATH || './logs/queries.log',
  slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD || '1000', 10), // 1 second
  maxFileSize: 10 * 1024 * 1024, // 10MB
  rotateOnSize: true,
};

/**
 * Query logger class for tracking database queries and performance
 */
export class QueryLogger {
  private config: QueryLoggerConfig;
  private logStream: fs.WriteStream | null = null;

  /**
   * Create a new QueryLogger instance
   * @param config Partial configuration to override defaults
   */
  constructor(config: Partial<QueryLoggerConfig> = {}) {
    this.config = { ...defaultConfig, ...config };

    if (this.config.enabled && this.config.logToFile) {
      this.initializeLogStream();
    }
  }

  /**
   * Initialize the log file stream
   */
  private initializeLogStream(): void {
    const logDir = path.dirname(this.config.logFilePath);

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Rotate log file if it exceeds max size
    if (this.config.rotateOnSize && fs.existsSync(this.config.logFilePath)) {
      const stats = fs.statSync(this.config.logFilePath);
      if (stats.size >= this.config.maxFileSize) {
        this.rotateLogFile();
      }
    }

    // Create write stream
    this.logStream = fs.createWriteStream(this.config.logFilePath, {
      flags: 'a', // append mode
    });

    // Handle stream errors
    this.logStream.on('error', (error) => {
      console.error('[Query Logger] Stream error:', error);
    });
  }

  /**
   * Rotate the current log file
   */
  private rotateLogFile(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = this.config.logFilePath.replace('.log', `.${timestamp}.log`);

    try {
      fs.renameSync(this.config.logFilePath, archivePath);
      console.log(chalk.yellow(`[Query Logger] Rotated log file to: ${archivePath}`));
    } catch (error) {
      console.error('[Query Logger] Failed to rotate log file:', error);
    }
  }

  /**
   * Format a log entry as a string
   * @param entry Log entry to format
   * @returns Formatted log string
   */
  private formatLogEntry(entry: QueryLogEntry): string {
    const parts = [`[${entry.timestamp}]`, `[${entry.level.toUpperCase()}]`];

    if (entry.duration !== undefined) {
      parts.push(`[${entry.duration}ms]`);
    }

    parts.push(entry.query);

    if (entry.values && entry.values.length > 0) {
      parts.push(`| Values: ${JSON.stringify(entry.values)}`);
    }

    if (entry.error) {
      parts.push(`| Error: ${entry.error}`);
    }

    if (entry.stackTrace) {
      parts.push(`\nStack: ${entry.stackTrace}`);
    }

    return parts.join(' ');
  }

  /**
   * Write log entry to file
   * @param entry Log entry to write
   */
  private writeToFile(entry: QueryLogEntry): void {
    if (!this.config.logToFile || !this.logStream) {
      return;
    }

    const logLine = this.formatLogEntry(entry) + '\n';
    this.logStream.write(logLine);
  }

  /**
   * Write log entry to console with colors
   * @param entry Log entry to write
   */
  private writeToConsole(entry: QueryLogEntry): void {
    if (!this.config.logToConsole) {
      return;
    }

    const timestamp = chalk.gray(entry.timestamp);
    const duration = entry.duration
      ? entry.duration > this.config.slowQueryThreshold
        ? chalk.red(`${entry.duration}ms`)
        : chalk.green(`${entry.duration}ms`)
      : '';

    let levelColor = chalk.blue;
    if (entry.level === 'error') levelColor = chalk.red;
    if (entry.level === 'warn') levelColor = chalk.yellow;

    const level = levelColor(`[${entry.level.toUpperCase()}]`);
    const query = chalk.cyan(entry.query);
    const values = entry.values ? chalk.gray(`| Values: ${JSON.stringify(entry.values)}`) : '';

    console.log(`${timestamp} ${level} ${duration} ${query} ${values}`);

    if (entry.error) {
      console.error(chalk.red(`Error: ${entry.error}`));
    }

    if (entry.stackTrace) {
      console.error(chalk.gray(entry.stackTrace));
    }
  }

  /**
   * Write a log entry
   * @param entry Log entry without timestamp
   */
  private log(entry: Omit<QueryLogEntry, 'timestamp'>): void {
    if (!this.config.enabled) {
      return;
    }

    const fullEntry: QueryLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    this.writeToFile(fullEntry);
    this.writeToConsole(fullEntry);
  }

  /**
   * Log a successful query execution
   * @param query SQL query string
   * @param values Parameter values
   * @param duration Execution duration in milliseconds
   */
  public logQuery(
    query: string,
    values?: Array<string | number | boolean | null>,
    duration?: number
  ): void {
    const level: LogLevel = duration && duration > this.config.slowQueryThreshold ? 'warn' : 'info';

    const logEntry: Omit<QueryLogEntry, 'timestamp'> = {
      level,
      query,
    };

    if (values && values.length > 0) {
      logEntry.values = values;
    }

    if (duration !== undefined) {
      logEntry.duration = duration;
    }

    this.log(logEntry);
  }

  /**
   * Log a query error
   * @param query SQL query string that failed
   * @param error Error that occurred
   * @param values Parameter values used
   */
  public logError(
    query: string,
    error: Error,
    values?: Array<string | number | boolean | null>
  ): void {
    const logEntry: Omit<QueryLogEntry, 'timestamp'> = {
      level: 'error',
      query,
      error: error.message,
    };

    if (values && values.length > 0) {
      logEntry.values = values;
    }

    if (error.stack) {
      logEntry.stackTrace = error.stack;
    }

    this.log(logEntry);
  }

  /**
   * Log a debug message
   * @param message Debug message
   */
  public logDebug(message: string): void {
    this.log({
      level: 'debug',
      query: message,
    });
  }

  /**
   * Log a warning message
   * @param message Warning message
   */
  public logWarning(message: string): void {
    this.log({
      level: 'warn',
      query: message,
    });
  }

  /**
   * Close the log stream and cleanup resources
   */
  public close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  /**
   * Update the logger configuration
   * @param config New configuration options
   */
  public updateConfig(config: Partial<QueryLoggerConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // Reinitialize if enabled state changed
    if (!wasEnabled && this.config.enabled) {
      this.initializeLogStream();
    } else if (wasEnabled && !this.config.enabled) {
      this.close();
    }
  }

  /**
   * Get current configuration
   * @returns Copy of current configuration
   */
  public getConfig(): QueryLoggerConfig {
    return { ...this.config };
  }

  /**
   * Get statistics about logged queries
   * @returns Basic statistics object (placeholder for future implementation)
   */
  public getStats(): {
    enabled: boolean;
    logToFile: boolean;
    logToConsole: boolean;
  } {
    return {
      enabled: this.config.enabled,
      logToFile: this.config.logToFile,
      logToConsole: this.config.logToConsole,
    };
  }
}

// Singleton instance
let queryLoggerInstance: QueryLogger | null = null;

/**
 * Get the singleton query logger instance
 * @param config Optional configuration for first-time initialization
 * @returns QueryLogger instance
 */
export function getQueryLogger(config?: Partial<QueryLoggerConfig>): QueryLogger {
  if (!queryLoggerInstance) {
    queryLoggerInstance = new QueryLogger(config);
  }
  return queryLoggerInstance;
}

/**
 * Initialize the query logger with custom configuration
 * This will replace any existing logger instance
 * @param config Configuration options
 * @returns New QueryLogger instance
 */
export function initialiseQueryLogger(config: Partial<QueryLoggerConfig>): QueryLogger {
  if (queryLoggerInstance) {
    queryLoggerInstance.close();
  }
  queryLoggerInstance = new QueryLogger(config);
  return queryLoggerInstance;
}

/**
 * Close and cleanup the query logger singleton
 */
export function closeQueryLogger(): void {
  if (queryLoggerInstance) {
    queryLoggerInstance.close();
    queryLoggerInstance = null;
  }
}

/**
 * Create a new QueryLogger instance (not singleton)
 * @param config Configuration options
 * @returns New QueryLogger instance
 */
export function createQueryLogger(config?: Partial<QueryLoggerConfig>): QueryLogger {
  return new QueryLogger(config);
}
