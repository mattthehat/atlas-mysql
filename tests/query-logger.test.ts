import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import {
  QueryLogger,
  getQueryLogger,
  initialiseQueryLogger,
  closeQueryLogger,
  createQueryLogger,
  type QueryLoggerConfig,
  type LogLevel,
} from '../src/query-logger';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    renameSync: vi.fn(),
    createWriteStream: vi.fn(),
  },
}));

// Mock path module
vi.mock('path', () => ({
  default: {
    dirname: vi.fn(() => 'logs'),
  },
}));

// Mock chalk module
vi.mock('chalk', () => ({
  default: {
    gray: vi.fn((text: string) => text),
    blue: vi.fn((text: string) => text),
    red: vi.fn((text: string) => text),
    yellow: vi.fn((text: string) => text),
    green: vi.fn((text: string) => text),
    cyan: vi.fn((text: string) => text),
  },
}));

describe('QueryLogger', () => {
  let mockWriteStream: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeAll(() => {
    // Mock console methods
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock write stream
    mockWriteStream = {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    };

    // Setup fs mocks
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.createWriteStream).mockReturnValue(mockWriteStream);
    vi.mocked(fs.statSync).mockReturnValue({ size: 1000 } as any);

    // Clear singleton
    closeQueryLogger();
  });

  afterEach(() => {
    closeQueryLogger();
  });

  describe('QueryLogger Constructor', () => {
    it('should create logger with default configuration', () => {
      const logger = new QueryLogger();
      const config = logger.getConfig();

      expect(config.enabled).toBe(false); // Default when QUERY_LOGGING_ENABLED is not set
      expect(config.logToFile).toBe(true);
      expect(config.logToConsole).toBe(false); // Default when NODE_ENV is not development
      expect(config.logFilePath).toBe('./logs/queries.log');
      expect(config.slowQueryThreshold).toBe(1000);
      expect(config.maxFileSize).toBe(10 * 1024 * 1024);
      expect(config.rotateOnSize).toBe(true);
    });

    it('should create logger with custom configuration', () => {
      const customConfig: Partial<QueryLoggerConfig> = {
        enabled: true,
        logToFile: false,
        logToConsole: true,
        logFilePath: './custom/path.log',
        slowQueryThreshold: 500,
        maxFileSize: 5 * 1024 * 1024,
        rotateOnSize: false,
      };

      const logger = new QueryLogger(customConfig);
      const config = logger.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.logToFile).toBe(false);
      expect(config.logToConsole).toBe(true);
      expect(config.logFilePath).toBe('./custom/path.log');
      expect(config.slowQueryThreshold).toBe(500);
      expect(config.maxFileSize).toBe(5 * 1024 * 1024);
      expect(config.rotateOnSize).toBe(false);
    });

    it('should initialize log stream when logging to file is enabled', () => {
      new QueryLogger({ enabled: true, logToFile: true });

      expect(fs.mkdirSync).toHaveBeenCalledWith('logs', { recursive: true });
      expect(fs.createWriteStream).toHaveBeenCalledWith('./logs/queries.log', {
        flags: 'a',
      });
    });

    it('should not initialize log stream when logging to file is disabled', () => {
      new QueryLogger({ enabled: true, logToFile: false });

      expect(fs.createWriteStream).not.toHaveBeenCalled();
    });
  });

  describe('Log File Management', () => {
    it('should create log directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      new QueryLogger({ enabled: true, logToFile: true });

      expect(fs.mkdirSync).toHaveBeenCalledWith('logs', { recursive: true });
    });

    it('should rotate log file when it exceeds max size', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 15 * 1024 * 1024 } as any);

      new QueryLogger({
        enabled: true,
        logToFile: true,
        maxFileSize: 10 * 1024 * 1024,
        rotateOnSize: true,
      });

      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('should not rotate log file when rotation is disabled', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 15 * 1024 * 1024 } as any);

      new QueryLogger({
        enabled: true,
        logToFile: true,
        maxFileSize: 10 * 1024 * 1024,
        rotateOnSize: false,
      });

      expect(fs.renameSync).not.toHaveBeenCalled();
    });
  });

  describe('Logging Methods', () => {
    it('should log successful queries', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: true,
      });

      logger.logQuery('SELECT * FROM users', ['param1'], 150);

      expect(mockWriteStream.write).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();

      const logCall = mockWriteStream.write.mock.calls[0][0];
      expect(logCall).toContain('[INFO]');
      expect(logCall).toContain('[150ms]');
      expect(logCall).toContain('SELECT * FROM users');
      expect(logCall).toContain('Values: [1 parameters redacted]');
    });

    it('should log slow queries as warnings', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: true,
        slowQueryThreshold: 100,
      });

      logger.logQuery('SELECT * FROM large_table', [], 2000);

      const logCall = mockWriteStream.write.mock.calls[0][0];
      expect(logCall).toContain('[WARN]');
      expect(logCall).toContain('[2000ms]');
    });

    it('should log query errors', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: true,
      });

      const error = new Error('Connection failed');
      error.stack = 'Error stack trace';

      logger.logError('SELECT * FROM users', error, ['param1']);

      expect(mockWriteStream.write).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // Error message + stack trace

      const logCall = mockWriteStream.write.mock.calls[0][0];
      expect(logCall).toContain('[ERROR]');
      expect(logCall).toContain('SELECT * FROM users');
      expect(logCall).toContain('Values: [1 parameters redacted]');
      expect(logCall).toContain('Error: Connection failed');
      expect(logCall).toContain('Stack: Error stack trace');
    });

    it('should log debug messages', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: true,
      });

      logger.logDebug('Debug message');

      const logCall = mockWriteStream.write.mock.calls[0][0];
      expect(logCall).toContain('[DEBUG]');
      expect(logCall).toContain('Debug message');
    });

    it('should log warning messages', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: true,
      });

      logger.logWarning('Warning message');

      const logCall = mockWriteStream.write.mock.calls[0][0];
      expect(logCall).toContain('[WARN]');
      expect(logCall).toContain('Warning message');
    });

    it('should not log when disabled', () => {
      const logger = new QueryLogger({
        enabled: false,
        logToFile: true,
        logToConsole: true,
      });

      logger.logQuery('SELECT * FROM users');
      logger.logError('SELECT * FROM users', new Error('test'));
      logger.logDebug('Debug message');

      expect(mockWriteStream.write).not.toHaveBeenCalled();
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should handle queries without values', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: true,
      });

      logger.logQuery('SELECT COUNT(*) FROM users');

      const logCall = mockWriteStream.write.mock.calls[0][0];
      expect(logCall).toContain('SELECT COUNT(*) FROM users');
      expect(logCall).not.toContain('Values:');
    });

    it('should handle errors without stack trace', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: true,
      });

      const error = new Error('Simple error');
      delete error.stack;

      logger.logError('SELECT * FROM users', error);

      const logCall = mockWriteStream.write.mock.calls[0][0];
      expect(logCall).toContain('Error: Simple error');
      expect(logCall).not.toContain('Stack:');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const logger = new QueryLogger({
        enabled: false,
        logToFile: false,
      });

      logger.updateConfig({
        enabled: true,
        logToFile: true,
        slowQueryThreshold: 200,
      });

      const config = logger.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.logToFile).toBe(true);
      expect(config.slowQueryThreshold).toBe(200);
    });

    it('should reinitialize stream when enabling file logging', () => {
      const logger = new QueryLogger({
        enabled: false,
        logToFile: false,
      });

      vi.clearAllMocks();

      logger.updateConfig({
        enabled: true,
        logToFile: true,
      });

      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it('should close stream when disabling logging', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
      });

      logger.updateConfig({
        enabled: false,
      });

      expect(mockWriteStream.end).toHaveBeenCalled();
    });
  });

  describe('Stream Management', () => {
    it('should close log stream', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
      });

      logger.close();

      expect(mockWriteStream.end).toHaveBeenCalled();
    });

    it('should get statistics', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
        logToConsole: false,
      });

      const stats = logger.getStats();

      expect(stats).toEqual({
        enabled: true,
        logToFile: true,
        logToConsole: false,
      });
    });
  });

  describe('Singleton Functions', () => {
    it('should get singleton logger instance', () => {
      const logger1 = getQueryLogger();
      const logger2 = getQueryLogger();

      expect(logger1).toBe(logger2);
    });

    it('should initialize logger with custom config', () => {
      const customConfig = {
        enabled: true,
        slowQueryThreshold: 300,
      };

      const logger = initialiseQueryLogger(customConfig);
      const config = logger.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.slowQueryThreshold).toBe(300);
    });

    it('should close existing logger when initializing new one', () => {
      const logger1 = initialiseQueryLogger({ enabled: true, logToFile: true });
      const closeSpy = vi.spyOn(logger1, 'close');

      initialiseQueryLogger({ enabled: true, logToFile: false });

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should create new logger instance (not singleton)', () => {
      const logger1 = createQueryLogger({ enabled: true });
      const logger2 = createQueryLogger({ enabled: true });

      expect(logger1).not.toBe(logger2);
    });

    it('should close singleton logger', () => {
      const logger = getQueryLogger({ enabled: true, logToFile: true });
      const closeSpy = vi.spyOn(logger, 'close');

      closeQueryLogger();

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('Log Formatting', () => {
    it('should format log entries correctly', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
      });

      logger.logQuery('SELECT * FROM users WHERE id = ?', [123], 250);

      const logCall = mockWriteStream.write.mock.calls[0][0];

      // Check timestamp format (ISO string)
      expect(logCall).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);

      // Check log level
      expect(logCall).toContain('[INFO]');

      // Check duration
      expect(logCall).toContain('[250ms]');

      // Check query
      expect(logCall).toContain('SELECT * FROM users WHERE id = ?');

      // Check values (redacted by default in non-dev mode)
      expect(logCall).toContain('Values: [1 parameters redacted]');

      // Check newline at end
      expect(logCall.endsWith('\n')).toBe(true);
    });

    it('should handle different log levels in console output', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToConsole: true,
        logToFile: false,
      });

      // Clear any previous calls
      consoleLogSpy.mockClear();
      consoleErrorSpy.mockClear();

      // Test different log levels
      logger.logQuery('SELECT query', [], 50); // info
      logger.logQuery('SLOW query', [], 2000); // warn (slow)
      logger.logError('ERROR query', new Error('test error'));
      logger.logDebug('DEBUG message');

      expect(consoleLogSpy).toHaveBeenCalledTimes(4); // info, warn, debug, plus one more
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // error message + stack trace
    });
  });

  describe('Environment Variable Integration', () => {
    it('should respect environment variables when provided explicitly', () => {
      // Test by passing config that mimics environment variable behavior
      const logger = new QueryLogger({
        enabled: true,
        logToFile: false,
        logToConsole: true,
        logFilePath: './custom/log/path.log',
        slowQueryThreshold: 500,
      });

      const config = logger.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.logToFile).toBe(false);
      expect(config.logToConsole).toBe(true);
      expect(config.logFilePath).toBe('./custom/log/path.log');
      expect(config.slowQueryThreshold).toBe(500);
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', () => {
      vi.mocked(fs.renameSync).mockImplementation(() => {
        throw new Error('File system error');
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.statSync).mockReturnValue({ size: 15 * 1024 * 1024 } as any);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Should not throw, but handle error gracefully
      expect(() => {
        new QueryLogger({
          enabled: true,
          logToFile: true,
          maxFileSize: 10 * 1024 * 1024,
          rotateOnSize: true,
        });
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Query Logger] Failed to rotate log file:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle stream errors', () => {
      const logger = new QueryLogger({
        enabled: true,
        logToFile: true,
      });

      // Simulate stream error
      const errorHandler = mockWriteStream.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];

      expect(errorHandler).toBeDefined();

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      errorHandler(new Error('Stream error'));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Query Logger] Stream error:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
