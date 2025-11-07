import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MySQLORM, QueryConfig } from '../src/mysql-orm';

// Mock environment variables before importing
vi.stubEnv('DB_USER', 'test_user');
vi.stubEnv('DB_PASS', 'test_pass');
vi.stubEnv('DB_HOST', 'localhost');
vi.stubEnv('DB_NAME', 'test_db');
vi.stubEnv('DB_PORT', '3306');
vi.stubEnv('NODE_ENV', 'test');

// Mock the mysql2/promise module
vi.mock('mysql2/promise', () => {
  const mockQuery = vi.fn();
  const mockGetConnection = vi.fn();
  const mockBeginTransaction = vi.fn();
  const mockCommit = vi.fn();
  const mockRollback = vi.fn();
  const mockRelease = vi.fn();
  const mockEnd = vi.fn();

  const mockConnection = {
    beginTransaction: mockBeginTransaction,
    commit: mockCommit,
    rollback: mockRollback,
    release: mockRelease,
    query: mockQuery,
  };

  const mockPool = {
    query: mockQuery,
    getConnection: mockGetConnection.mockResolvedValue(mockConnection),
    end: mockEnd,
  };

  return {
    default: {
      createPool: vi.fn(() => mockPool),
    },
    escapeId: vi.fn((str: string) => `\`${str}\``),
    escape: vi.fn((str: string) => `'${str}'`),
  };
});

// Mock chalk
vi.mock('chalk', () => ({
  default: {
    blue: vi.fn((text: string) => text),
    cyan: vi.fn((text: string) => text),
    gray: vi.fn((text: string) => text),
    green: vi.fn((text: string) => text),
    red: vi.fn((text: string) => text),
    yellow: vi.fn((text: string) => text),
    magentaBright: vi.fn((text: string) => text),
  },
}));

// Mock query logger
vi.mock('../src/query-logger', () => ({
  getQueryLogger: vi.fn(() => ({
    logQuery: vi.fn(),
    logError: vi.fn(),
  })),
}));

describe('MySQL ORM', () => {
  let mysqlOrm: MySQLORM;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the module after mocks are set up
    const { MySQLORM } = await import('../src/mysql-orm');

    mysqlOrm = new MySQLORM({
      host: 'localhost',
      user: 'test_user',
      password: 'test_pass',
      database: 'test_db',
      port: 3306,
    });
  });

  describe('getData', () => {
    it('should return data and count', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      // Mock the query responses
      vi.mocked(pool.query)
        .mockResolvedValueOnce([
          [{ id: 1, name: 'Test User', email: 'test@example.com' }],
          [],
        ] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
          name: 'userName',
          email: 'userEmail',
        },
      };

      const result = await mysqlOrm.getData(config);

      expect(result.rows).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.rows[0]).toEqual({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
      });
    });

    it('should handle WHERE clauses', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[{ id: 1, name: 'Test User' }], []] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
          name: 'userName',
        },
        where: ['userEmail = ?', 'userActive = ?'],
      };

      await mysqlOrm.getData(config, ['test@example.com', 1]);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE'), [
        'test@example.com',
        1,
      ]);
    });

    it('should handle JOINs', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
          name: 'userName',
          role: 'roles.roleName',
        },
        joins: [
          {
            type: 'INNER',
            table: 'roles',
            on: 'users.roleId = roles.roleId',
          },
        ],
      };

      await mysqlOrm.getData(config);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INNER JOIN'), []);
    });

    it('should handle ORDER BY and LIMIT', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
          name: 'userName',
        },
        orderBy: 'userName',
        orderDirection: 'DESC',
        limit: 20,
        offset: 10,
      };

      await mysqlOrm.getData(config);

      const query = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(query).toContain('ORDER BY');
      expect(query).toContain('DESC');
      expect(query).toContain('LIMIT 20');
      expect(query).toContain('OFFSET 10');
    });
  });

  describe('getFirst', () => {
    it('should return first matching record', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([
        [{ id: 1, name: 'First User', email: 'first@example.com' }],
        [],
      ] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
          name: 'userName',
          email: 'userEmail',
        },
        where: ['userEmail = ?'],
      };

      const result = await mysqlOrm.getFirst(config, ['first@example.com']);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.email).toBe('first@example.com');
    });

    it('should return null when no record found', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([[], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
          name: 'userName',
        },
        where: ['userId = ?'],
      };

      const result = await mysqlOrm.getFirst(config, [999]);

      expect(result).toBeNull();
    });

    it('should apply LIMIT 1 automatically', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([[], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
        },
      };

      await mysqlOrm.getFirst(config);

      const query = vi.mocked(pool.query).mock.calls[0][0] as string;
      expect(query).toContain('LIMIT 1');
    });
  });

  describe('insertData', () => {
    it('should insert data and return insertId', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ insertId: 123, affectedRows: 1 }, []] as any);

      const data = {
        userName: 'New User',
        userEmail: 'new@example.com',
        userPassword: 'hashedpassword',
      };

      const insertId = await mysqlOrm.insertData('users', data);

      expect(insertId).toBe(123);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO'), [
        'New User',
        'new@example.com',
        'hashedpassword',
      ]);
    });

    it('should handle null values', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ insertId: 124, affectedRows: 1 }, []] as any);

      const data = {
        userName: 'User',
        userMiddleName: null,
        userEmail: 'user@example.com',
      };

      await mysqlOrm.insertData('users', data);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO'), [
        'User',
        null,
        'user@example.com',
      ]);
    });
  });

  describe('updateData', () => {
    it('should update data and return affected rows', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ affectedRows: 1, changedRows: 1 }, []] as any);

      const affectedRows = await mysqlOrm.updateData({
        table: 'users',
        data: {
          userName: 'Updated Name',
          userEmail: 'updated@example.com',
        },
        where: ['userId = ?'],
        values: [1],
      });

      expect(affectedRows).toBe(1);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE'), [
        'Updated Name',
        'updated@example.com',
        1,
      ]);
    });
  });

  describe('deleteData', () => {
    it('should delete data and return affected rows', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ affectedRows: 1 }, []] as any);

      const affectedRows = await mysqlOrm.deleteData('users', {
        userId: 1,
      });

      expect(affectedRows).toBe(1);
      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'), [1]);
    });
  });

  describe('rawQuery', () => {
    it('should execute raw SQL queries', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      const mockResults = [{ id: 1, name: 'Test' }];
      vi.mocked(pool.query).mockResolvedValueOnce([mockResults, []] as any);

      const result = await mysqlOrm.rawQuery('SELECT * FROM users WHERE id = ?', [1]);

      expect(result).toEqual(mockResults);
      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
    });
  });

  describe('Transaction', () => {
    it('should handle transactions correctly', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ insertId: 1, affectedRows: 1 }, []] as any);

      const result = await mysqlOrm.withTransaction(async (transaction) => {
        await mysqlOrm.insertData('users', { name: 'Test User' }, transaction);
        return 'success';
      });

      expect(result).toBe('success');
      expect(pool.getConnection).toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockRejectedValueOnce(new Error('Test error'));

      await expect(
        mysqlOrm.withTransaction(async (transaction) => {
          await mysqlOrm.insertData('users', { name: 'Test User' }, transaction);
        })
      ).rejects.toThrow('Failed to insert data');

      expect(pool.getConnection).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle query errors gracefully', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockRejectedValueOnce(new Error('Connection failed'));

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
        },
      };

      await expect(mysqlOrm.getFirst(config)).rejects.toThrow('Failed to fetch data');
    });

    it('should handle insert errors', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockRejectedValueOnce(new Error('Duplicate entry'));

      await expect(mysqlOrm.insertData('users', { userName: 'Test' })).rejects.toThrow();
    });
  });
});
