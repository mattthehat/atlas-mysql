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

    it('should handle WHERE clauses with != conditions', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[{ id: 2, name: 'Active User' }], []] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'userId',
        fields: {
          id: 'userId',
          name: 'userName',
        },
        where: ['userDeleted != ?', 'userBanned != ?'],
      };

      await mysqlOrm.getData(config, [1, 1]);

      expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('WHERE'), [1, 1]);
    });

    it('should handle combined WHERE clauses with != and = conditions', async () => {
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
        where: ['userActive = ?', 'userDeleted != ?'],
      };

      await mysqlOrm.getData(config, [1, 1]);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('WHERE');
      expect(query).toContain('!=');
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

      const query = vi.mocked(pool.query).mock.calls[0][0] as unknown as string;
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

      const query = vi.mocked(pool.query).mock.calls[0][0] as unknown as string;
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

  describe('Subqueries', () => {
    it('should build query with single subquery in SELECT', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              name: 'Test User',
              orderCount: 5,
            },
          ],
          [],
        ] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          name: 'full_name',
          orderCount: {
            table: 'orders',
            idField: 'order_id',
            fields: {
              count: 'COUNT(order_id)',
            },
            where: ['orders.user_id = users.user_id'],
          },
        },
      };

      const result = await mysqlOrm.getData(config);

      expect(pool.query).toHaveBeenCalled();
      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('SELECT');
      expect(query).toContain('COUNT');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].orderCount).toBe(5);
    });

    it('should build query with multiple subqueries', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              name: 'Product A',
              salesCount: 10,
              avgRating: 4.5,
            },
          ],
          [],
        ] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'products',
        idField: 'product_id',
        fields: {
          id: 'product_id',
          name: 'product_name',
          salesCount: {
            table: 'order_items',
            idField: 'item_id',
            fields: {
              count: 'COUNT(item_id)',
            },
            where: ['order_items.product_id = products.product_id'],
          },
          avgRating: {
            table: 'reviews',
            idField: 'review_id',
            fields: {
              avg: 'AVG(rating)',
            },
            where: ['reviews.product_id = products.product_id'],
          },
        },
      };

      const result = await mysqlOrm.getData(config);

      expect(pool.query).toHaveBeenCalled();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].salesCount).toBe(10);
      expect(result.rows[0].avgRating).toBe(4.5);
    });

    it('should handle subquery with multiple WHERE conditions', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([
          [
            {
              id: 1,
              name: 'User A',
              recentOrders: 3,
            },
          ],
          [],
        ] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          name: 'full_name',
          recentOrders: {
            table: 'orders',
            idField: 'order_id',
            fields: {
              count: 'COUNT(order_id)',
            },
            where: [
              'orders.user_id = users.user_id',
              'orders.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
              'orders.status = ?',
            ],
          },
        },
      };

      const result = await mysqlOrm.getData(config, ['completed']);

      expect(pool.query).toHaveBeenCalled();
      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('WHERE');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].recentOrders).toBe(3);
    });

    it('should combine subqueries with regular fields', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([
          [
            {
              userId: 1,
              userName: 'John Doe',
              userEmail: 'john@example.com',
              totalSpent: 1250.5,
            },
          ],
          [],
        ] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          userId: 'user_id',
          userName: 'full_name',
          userEmail: 'email_address',
          totalSpent: {
            table: 'orders',
            idField: 'order_id',
            fields: {
              sum: 'SUM(total_amount)',
            },
            where: ['orders.user_id = users.user_id'],
          },
        },
        where: ['is_active = ?'],
      };

      const result = await mysqlOrm.getData(config, [1]);

      expect(pool.query).toHaveBeenCalled();
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].userName).toBe('John Doe');
      expect(result.rows[0].totalSpent).toBe(1250.5);
    });

    it('should use getFirst with subquery', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([
        [
          {
            id: 1,
            name: 'Top User',
            orderTotal: 5000,
          },
        ],
        [],
      ] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          name: 'full_name',
          orderTotal: {
            table: 'orders',
            idField: 'order_id',
            fields: {
              sum: 'SUM(total_amount)',
            },
            where: ['orders.user_id = users.user_id'],
          },
        },
        orderBy: 'user_id',
        orderDirection: 'DESC',
      };

      const result = await mysqlOrm.getFirst(config);

      expect(pool.query).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result?.name).toBe('Top User');
      expect(result?.orderTotal).toBe(5000);
    });
  });

  describe('JSON SQL Generation', () => {
    it('should generate JSON_OBJECT SQL with simple values', () => {
      const config = {
        name: 'John Doe',
        age: 30,
        city: 'New York',
      };

      const result = mysqlOrm.getJsonSql(config);

      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'name'");
      expect(result).toContain("'John Doe'");
      expect(result).toContain("'age'");
      expect(result).toContain('30');
      expect(result).toContain("'city'");
      expect(result).toContain("'New York'");
      expect(result).toContain(')');
    });

    it('should generate JSON_OBJECT SQL with null values', () => {
      const config = {
        name: 'Jane Doe',
        middleName: null,
        age: 25,
      };

      const result = mysqlOrm.getJsonSql(config);

      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'name'");
      expect(result).toContain("'Jane Doe'");
      expect(result).toContain("'middleName'");
      expect(result).toContain("'null'");
      expect(result).toContain(')');
    });

    it('should generate JSON_OBJECT SQL with nested objects', () => {
      const config = {
        user: 'John',
        address: {
          street: '123 Main St',
          city: 'Boston',
        },
      } as any;

      const result = mysqlOrm.getJsonSql(config);

      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'user'");
      expect(result).toContain("'John'");
      expect(result).toContain("'address'");
      expect(result).toContain("'street'");
      expect(result).toContain("'123 Main St'");
      expect(result).toContain("'city'");
      expect(result).toContain("'Boston'");
    });

    it('should generate JSON_AGG SQL with array of objects', () => {
      const config = [
        { id: 1, name: 'Product A' },
        { id: 2, name: 'Product B' },
      ];

      const result = mysqlOrm.getJsonArraySql(config);

      expect(result).toContain('JSON_AGG(');
      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'id'");
      expect(result).toContain('1');
      expect(result).toContain("'name'");
      expect(result).toContain("'Product A'");
      expect(result).toContain('2');
      expect(result).toContain("'Product B'");
      expect(result).toContain(')');
    });

    it('should generate JSON_AGG SQL with mixed value types', () => {
      const config = [
        { id: 1, name: 'Item 1', price: 100 },
        { id: 2, name: 'Item 2', price: null },
      ];

      const result = mysqlOrm.getJsonArraySql(config);

      expect(result).toContain('JSON_AGG(');
      expect(result).toContain('100');
      expect(result).toContain("'null'");
      expect(result).toContain(')');
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
