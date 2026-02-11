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
    it('should generate JSON_OBJECT SQL with column references', () => {
      const config = {
        name: 'full_name',
        age: 'user_age',
        city: 'user_city',
      };

      const result = mysqlOrm.getJsonSql(config);

      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'name'");
      expect(result).toContain('`full_name`'); // Column reference, not literal
      expect(result).toContain("'age'");
      expect(result).toContain('`user_age`'); // Column reference
      expect(result).toContain("'city'");
      expect(result).toContain('`user_city`'); // Column reference
      expect(result).toContain(')');
    });

    it('should generate JSON_OBJECT SQL with null column references', () => {
      const config = {
        name: 'full_name',
        middleName: null,
        age: 'user_age',
      };

      const result = mysqlOrm.getJsonSql(config);

      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'name'");
      expect(result).toContain('`full_name`');
      expect(result).toContain("'middleName'");
      expect(result).toContain('`null`'); // Null is converted to string "null" then escaped
      expect(result).toContain(')');
    });

    it('should generate JSON_OBJECT SQL with nested objects', () => {
      const config = {
        user: 'user_name',
        address: {
          street: 'street_address',
          city: 'city_name',
        },
      } as any;

      const result = mysqlOrm.getJsonSql(config);

      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'user'");
      expect(result).toContain('`user_name`');
      expect(result).toContain("'address'");
      expect(result).toContain("'street'");
      expect(result).toContain('`street_address`');
      expect(result).toContain("'city'");
      expect(result).toContain('`city_name`');
    });

    it('should generate JSON_ARRAYAGG SQL with array of objects', () => {
      const config = [
        { id: 'order_id', name: 'product_name' },
        { id: 'item_id', name: 'item_name' },
      ];

      const result = mysqlOrm.getJsonArraySql(config);

      expect(result).toContain('JSON_ARRAYAGG('); // Fixed: now uses MySQL's JSON_ARRAYAGG
      expect(result).toContain('JSON_OBJECT(');
      expect(result).toContain("'id'");
      expect(result).toContain('`order_id`');
      expect(result).toContain("'name'");
      expect(result).toContain('`product_name`');
      expect(result).toContain('`item_id`');
      expect(result).toContain('`item_name`');
      expect(result).toContain(')');
    });

    it('should generate JSON_ARRAYAGG SQL with mixed value types', () => {
      const config = [
        { id: 'item_id', name: 'item_name', price: 'item_price' },
        { id: 'product_id', name: 'product_name', price: null },
      ];

      const result = mysqlOrm.getJsonArraySql(config);

      expect(result).toContain('JSON_ARRAYAGG('); // Fixed: now uses MySQL's JSON_ARRAYAGG
      expect(result).toContain('`item_price`');
      expect(result).toContain('`null`');
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

  describe('Alias Support', () => {
    describe('Alias Resolution in WHERE clauses', () => {
      it('should resolve field alias to column name in WHERE clause with = operator', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[{ id: 1, name: 'John Doe' }], []] as any)
          .mockResolvedValueOnce([[{ count: 1 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            name: 'full_name',
            email: 'email_address',
          },
          where: ['name = ?'],
        };

        await mysqlOrm.getData(config, ['John Doe']);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        // Should resolve 'name' to 'full_name' in WHERE clause
        expect(query).toContain('WHERE full_name = ?');
        // Should still have name as alias in SELECT
        expect(query).toContain('AS `name`');
      });

      it('should resolve field alias in WHERE clause with != operator', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            status: 'user_status',
          },
          where: ['status != ?'],
        };

        await mysqlOrm.getData(config, ['deleted']);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('user_status != ?');
      });

      it('should resolve field alias in WHERE clause with comparison operators', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'products',
          idField: 'product_id',
          fields: {
            id: 'product_id',
            price: 'product_price',
          },
          where: ['price > ?', 'price <= ?'],
        };

        await mysqlOrm.getData(config, [100, 500]);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('product_price > ?');
        expect(query).toContain('product_price <= ?');
      });

      it('should resolve field alias in WHERE clause with LIKE operator', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            name: 'full_name',
          },
          where: ['name LIKE ?'],
        };

        await mysqlOrm.getData(config, ['%John%']);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('full_name LIKE ?');
      });

      it('should handle multiple alias resolutions in WHERE clauses', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            name: 'full_name',
            email: 'email_address',
            status: 'user_status',
          },
          where: ['name = ?', 'email LIKE ?', 'status != ?'],
        };

        await mysqlOrm.getData(config, ['John', '%@example.com', 'deleted']);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('full_name = ?');
        expect(query).toContain('email_address LIKE ?');
        expect(query).toContain('user_status != ?');
      });
    });

    describe('Alias Resolution in whereIn', () => {
      it('should resolve field alias in whereIn clause', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            status: 'user_status',
          },
          whereIn: {
            status: ['active', 'pending', 'verified'],
          },
        };

        await mysqlOrm.getData(config);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('`user_status` IN (?, ?, ?)');
      });
    });

    describe('Alias Resolution in whereNotIn', () => {
      it('should resolve field alias in whereNotIn clause', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            status: 'user_status',
          },
          whereNotIn: {
            status: ['deleted', 'banned', 'suspended'],
          },
        };

        await mysqlOrm.getData(config);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('`user_status` NOT IN (?, ?, ?)');
      });

      it('should handle whereNotIn with multiple fields', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            status: 'user_status',
            role: 'user_role',
          },
          whereNotIn: {
            status: ['deleted', 'banned'],
            role: ['guest'],
          },
        };

        await mysqlOrm.getData(config);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('`user_status` NOT IN (?, ?)');
        expect(query).toContain('`user_role` NOT IN (?)');
      });

      it('should handle whereNotIn with empty array', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            status: 'user_status',
          },
          whereNotIn: {
            status: [],
          },
        };

        await mysqlOrm.getData(config);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        // Empty array should not add NOT IN clause
        expect(query).not.toContain('NOT IN');
      });
    });

    describe('Alias Resolution in ORDER BY', () => {
      it('should resolve field alias in simple ORDER BY string', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            name: 'full_name',
          },
          orderBy: 'name',
          orderDirection: 'ASC',
        };

        await mysqlOrm.getData(config);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('ORDER BY `full_name` ASC');
      });

      it('should resolve field alias in ORDER BY array with direction suffix', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
            name: 'full_name',
            created: 'created_at',
          },
          orderBy: ['name ASC', 'created DESC'],
        };

        await mysqlOrm.getData(config);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('ORDER BY');
        // With direction suffix in the string, the whole thing gets escaped
        expect(query).toMatch(/ORDER BY.*full_name.*ASC/);
        expect(query).toMatch(/created_at.*DESC/);
      });

      it('should resolve field alias in ORDER BY with object notation', async () => {
        const mysql = await import('mysql2/promise');
        const pool = mysql.default.createPool({} as any);

        vi.mocked(pool.query)
          .mockResolvedValueOnce([[], []] as any)
          .mockResolvedValueOnce([[{ count: 0 }], []] as any);

        const config: QueryConfig = {
          table: 'products',
          idField: 'product_id',
          fields: {
            id: 'product_id',
            price: 'product_price',
            name: 'product_name',
          },
          orderBy: [
            { column: 'price', direction: 'DESC' },
            { column: 'name', direction: 'ASC' },
          ],
        };

        await mysqlOrm.getData(config);

        const [query] = vi.mocked(pool.query).mock.calls[0];
        expect(query).toContain('ORDER BY');
        expect(query).toContain('`product_price` DESC');
        expect(query).toContain('`product_name` ASC');
      });
    });
  });

  describe('DISTINCT Support', () => {
    it('should add DISTINCT to SELECT query when distinct is true', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[{ id: 1, city: 'London' }], []] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          city: 'user_city',
        },
        distinct: true,
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('SELECT DISTINCT');
    });

    it('should add DISTINCT to COUNT query when distinct is true', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 5 }], []] as any);

      const config: QueryConfig = {
        table: 'orders',
        idField: 'order_id',
        fields: {
          id: 'order_id',
        },
        distinct: true,
      };

      await mysqlOrm.getData(config);

      // getData makes two queries: one for data, one for count
      expect(vi.mocked(pool.query)).toHaveBeenCalledTimes(2);
      const countQuery = vi.mocked(pool.query).mock.calls[1][0] as unknown as string;
      expect(countQuery).toContain('COUNT(DISTINCT');
    });

    it('should not add DISTINCT when distinct is false', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
        },
        distinct: false,
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).not.toContain('DISTINCT');
    });
  });

  describe('Batch Insert', () => {
    it('should insert multiple records in a single query', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ insertId: 100, affectedRows: 3 }, []] as any);

      const data = [
        { userName: 'User 1', userEmail: 'user1@example.com' },
        { userName: 'User 2', userEmail: 'user2@example.com' },
        { userName: 'User 3', userEmail: 'user3@example.com' },
      ];

      const result = await mysqlOrm.batchInsertData('users', data);

      expect(result).toEqual({ firstInsertId: 100, affectedRows: 3 });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining([
          'User 1',
          'user1@example.com',
          'User 2',
          'user2@example.com',
          'User 3',
          'user3@example.com',
        ])
      );

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('VALUES (?, ?), (?, ?), (?, ?)');
    });

    it('should handle batch insert with null values', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ insertId: 200, affectedRows: 2 }, []] as any);

      const data = [
        { userName: 'User 1', userMiddleName: null },
        { userName: 'User 2', userMiddleName: 'Middle' },
      ];

      const result = await mysqlOrm.batchInsertData('users', data);

      expect(result).toEqual({ firstInsertId: 200, affectedRows: 2 });
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO'),
        expect.arrayContaining(['User 1', null, 'User 2', 'Middle'])
      );
    });

    it('should return zero values for empty data', async () => {
      const result = await mysqlOrm.batchInsertData('users', []);
      expect(result).toEqual({ firstInsertId: 0, affectedRows: 0 });
    });

    it('should handle batch insert within transaction', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([{ insertId: 300, affectedRows: 2 }, []] as any);

      const data = [{ userName: 'User A' }, { userName: 'User B' }];

      await mysqlOrm.withTransaction(async (transaction) => {
        const result = await mysqlOrm.batchInsertData('users', data, transaction);
        expect(result).toEqual({ firstInsertId: 300, affectedRows: 2 });
      });

      expect(pool.getConnection).toHaveBeenCalled();
    });
  });

  describe('Enhanced HAVING Clause', () => {
    it('should support HAVING with array of conditions', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'orders',
        idField: 'order_id',
        fields: {
          id: 'order_id',
          total: 'SUM(order_amount)',
        },
        groupBy: 'user_id',
        having: ['SUM(order_amount) > 1000', 'COUNT(order_id) >= 5'],
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('HAVING');
      expect(query).toContain('SUM(order_amount) > 1000');
      expect(query).toContain('COUNT(order_id) >= 5');
    });

    it('should support HAVING with comparison operators', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'sales',
        idField: 'sale_id',
        fields: {
          id: 'sale_id',
          avgPrice: 'AVG(price)',
        },
        groupBy: 'category',
        having: ['AVG(price) > 50', 'AVG(price) <= 500', 'COUNT(*) >= 10'],
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('HAVING');
      expect(query).toContain('AVG(price) > 50');
      expect(query).toContain('AVG(price) <= 500');
    });
  });

  describe('Explicit Raw SQL Marker', () => {
    it('should handle explicit raw SQL in field values', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[{ id: 1, formattedDate: '2024-01-01' }], []] as any)
        .mockResolvedValueOnce([[{ count: 1 }], []] as any);

      const config: QueryConfig = {
        table: 'events',
        idField: 'event_id',
        fields: {
          id: 'event_id',
          formattedDate: { raw: "DATE_FORMAT(event_date, '%Y-%m-%d')" },
        },
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain("DATE_FORMAT(event_date, '%Y-%m-%d')");
      expect(query).toContain('AS `formattedDate`');
    });

    it('should handle multiple raw SQL expressions', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          age: { raw: 'TIMESTAMPDIFF(YEAR, birth_date, CURDATE())' },
          fullAddress: { raw: "CONCAT(street, ', ', city, ', ', country)" },
        },
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('TIMESTAMPDIFF(YEAR, birth_date, CURDATE())');
      expect(query).toContain("CONCAT(street, ', ', city, ', ', country)");
    });
  });

  describe('JOIN ON Clause Validation', () => {
    it('should reject JOIN ON clause with SQL injection attempts', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
        },
        joins: [
          {
            type: 'INNER',
            table: 'roles',
            on: 'users.role_id = roles.role_id; DROP TABLE users; --',
          },
        ],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'Invalid JOIN ON clause: potentially dangerous pattern detected'
      );
    });

    it('should reject JOIN ON clause with UNION injection', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
        },
        joins: [
          {
            type: 'INNER',
            table: 'roles',
            on: 'users.role_id = roles.role_id UNION SELECT * FROM passwords',
          },
        ],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'Invalid JOIN ON clause: potentially dangerous pattern detected'
      );
    });

    it('should reject JOIN ON clause with dangerous keywords', async () => {
      const dangerousOnClauses = [
        'users.id = roles.id OR 1=1 DELETE FROM users',
        'users.id = roles.id; INSERT INTO logs VALUES (1)',
        'users.id = roles.id /* comment */ DROP TABLE sessions',
        'users.id = roles.id AND EXEC sp_executesql',
      ];

      for (const onClause of dangerousOnClauses) {
        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: {
            id: 'user_id',
          },
          joins: [
            {
              type: 'INNER',
              table: 'roles',
              on: onClause,
            },
          ],
        };

        await expect(mysqlOrm.getData(config)).rejects.toThrow(
          'Invalid JOIN ON clause: potentially dangerous pattern detected'
        );
      }
    });

    it('should accept valid JOIN ON clauses', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
        },
        joins: [
          {
            type: 'INNER',
            table: 'roles',
            on: 'users.role_id = roles.role_id',
          },
        ],
      };

      await expect(mysqlOrm.getData(config)).resolves.toBeDefined();
    });
  });

  describe('Multiple ORDER BY Directions', () => {
    it('should handle ORDER BY with array of strings and shared direction', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          name: 'full_name',
          created: 'created_at',
        },
        orderBy: ['name', 'created'],
        orderDirection: 'DESC',
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('ORDER BY');
      expect(query).toContain('`full_name` DESC');
      expect(query).toContain('`created_at` DESC');
    });

    it('should handle ORDER BY with mixed object and string notation', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'products',
        idField: 'product_id',
        fields: {
          id: 'product_id',
          price: 'product_price',
          name: 'product_name',
          stock: 'stock_count',
        },
        orderBy: [
          { column: 'price', direction: 'DESC' },
          { column: 'stock', direction: 'ASC' },
          { column: 'name' },
        ],
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('ORDER BY');
      expect(query).toContain('`product_price` DESC');
      expect(query).toContain('`stock_count` ASC');
      expect(query).toContain('`product_name` ASC');
    });

    it('should handle ORDER BY with default ASC when direction not specified', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          name: 'full_name',
        },
        orderBy: [{ column: 'name' }],
      };

      await mysqlOrm.getData(config);

      const [query] = vi.mocked(pool.query).mock.calls[0];
      expect(query).toContain('ORDER BY');
      expect(query).toContain('`full_name` ASC');
    });
  });

  describe('WHERE Clause Validation', () => {
    it('should reject WHERE clauses with SQL injection attempts', async () => {
      const dangerousClauses = [
        'user_id = 1; DROP TABLE users',
        'user_id = 1 -- comment',
        'user_id = 1 /* block comment */',
        'user_id = 1 UNION SELECT * FROM passwords',
        'user_id = 1 OR DELETE FROM users',
        'user_id = 1 OR INSERT INTO logs VALUES (1)',
        'user_id = 1 OR UPDATE users SET admin = 1',
      ];

      for (const clause of dangerousClauses) {
        const config: QueryConfig = {
          table: 'users',
          idField: 'user_id',
          fields: { id: 'user_id' },
          where: [clause],
        };

        await expect(mysqlOrm.getData(config)).rejects.toThrow(
          'Invalid WHERE clause: potentially dangerous pattern detected'
        );
      }
    });

    it('should reject WHERE clauses with SLEEP/BENCHMARK injection', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id' },
        where: ['user_id = 1 OR SLEEP(5)'],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'Invalid WHERE clause: potentially dangerous pattern detected'
      );
    });

    it('should accept valid WHERE clauses', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id', name: 'full_name' },
        where: ['full_name = ?', 'user_id > ?'],
      };

      await expect(mysqlOrm.getData(config, ['John', 0])).resolves.toBeDefined();
    });
  });

  describe('HAVING Clause Validation', () => {
    it('should reject HAVING clauses with SQL injection attempts', async () => {
      const config: QueryConfig = {
        table: 'orders',
        idField: 'order_id',
        fields: { id: 'order_id', total: 'SUM(amount)' },
        groupBy: 'user_id',
        having: ['SUM(amount) > 100; DROP TABLE orders'],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'Invalid HAVING clause: potentially dangerous pattern detected'
      );
    });

    it('should accept valid HAVING clauses', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'orders',
        idField: 'order_id',
        fields: { id: 'order_id', total: 'SUM(amount)' },
        groupBy: 'user_id',
        having: ['SUM(amount) > 100', 'COUNT(*) >= 5'],
      };

      await expect(mysqlOrm.getData(config)).resolves.toBeDefined();
    });
  });

  describe('Raw SQL Field Validation', () => {
    it('should reject raw SQL fields with injection attempts', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: {
          id: 'user_id',
          evil: { raw: '1; DROP TABLE users; --' },
        },
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'Invalid raw SQL field: potentially dangerous pattern detected'
      );
    });

    it('should accept valid raw SQL expressions', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'events',
        idField: 'event_id',
        fields: {
          id: 'event_id',
          formattedDate: { raw: "DATE_FORMAT(event_date, '%Y-%m-%d')" },
        },
      };

      await expect(mysqlOrm.getData(config)).resolves.toBeDefined();
    });
  });

  describe('getFirst does not mutate config', () => {
    it('should not modify the original config object', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([[], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id' },
        limit: 50,
      };

      await mysqlOrm.getFirst(config);

      expect(config.limit).toBe(50);
    });
  });

  describe('COUNT query optimization', () => {
    it('should not include ORDER BY in count queries', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query)
        .mockResolvedValueOnce([[], []] as any)
        .mockResolvedValueOnce([[{ count: 0 }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id', name: 'full_name' },
        orderBy: 'full_name',
        orderDirection: 'DESC',
      };

      await mysqlOrm.getData(config);

      // The count query is the second call
      const countQuery = vi.mocked(pool.query).mock.calls[1][0] as unknown as string;
      expect(countQuery).not.toContain('ORDER BY');
      expect(countQuery).toContain('COUNT');
    });
  });

  describe('skipCount option', () => {
    it('should skip the count query when skipCount is true', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([[{ id: 1, name: 'Test User' }], []] as any);

      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id', name: 'full_name' },
      };

      const result = await mysqlOrm.getData(config, [], { skipCount: true });

      expect(result.rows).toHaveLength(1);
      expect(result.count).toBe(-1);
      // Should only call query once (no count query)
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('Expanded injection pattern detection', () => {
    it('should reject SLEEP injection in JOIN ON clause', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id' },
        joins: [
          {
            type: 'INNER',
            table: 'roles',
            on: 'users.role_id = roles.role_id AND SLEEP(5)',
          },
        ],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'potentially dangerous pattern detected'
      );
    });

    it('should reject BENCHMARK injection', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id' },
        where: ['user_id = BENCHMARK(10000000, SHA1(1))'],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'potentially dangerous pattern detected'
      );
    });

    it('should reject LOAD_FILE injection', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id' },
        where: ["user_name = LOAD_FILE('/etc/passwd')"],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'potentially dangerous pattern detected'
      );
    });

    it('should reject INTO OUTFILE injection', async () => {
      const config: QueryConfig = {
        table: 'users',
        idField: 'user_id',
        fields: { id: 'user_id' },
        where: ["1=1 INTO OUTFILE '/tmp/data.txt'"],
      };

      await expect(mysqlOrm.getData(config)).rejects.toThrow(
        'potentially dangerous pattern detected'
      );
    });
  });

  describe('createTable identifier validation', () => {
    it('should reject invalid charset in column options', async () => {
      await expect(
        mysqlOrm.createTable({
          table: 'test',
          columns: [
            {
              name: 'name',
              type: 'varchar',
              options: { length: 255, charset: "utf8'; DROP TABLE test; --" },
            },
          ],
          primaryKey: 'name',
        })
      ).rejects.toThrow('Invalid character set');
    });

    it('should reject invalid engine name', async () => {
      await expect(
        mysqlOrm.createTable({
          table: 'test',
          columns: [{ name: 'id', type: 'int', options: { autoIncrement: true } }],
          primaryKey: 'id',
          tableOptions: { engine: 'InnoDB; DROP TABLE test' },
        })
      ).rejects.toThrow('Invalid engine');
    });

    it('should reject invalid foreign key reference format', async () => {
      await expect(
        mysqlOrm.createTable({
          table: 'test',
          columns: [
            { name: 'id', type: 'int' },
            { name: 'user_id', type: 'int' },
          ],
          primaryKey: 'id',
          foreignKeys: [
            {
              column: 'user_id',
              reference: 'users(id); DROP TABLE test; --',
              onDelete: 'CASCADE',
            },
          ],
        })
      ).rejects.toThrow('Invalid foreign key reference format');
    });

    it('should accept valid foreign key reference', async () => {
      const mysql = await import('mysql2/promise');
      const pool = mysql.default.createPool({} as any);

      vi.mocked(pool.query).mockResolvedValueOnce([[], []] as any);

      await expect(
        mysqlOrm.createTable({
          table: 'orders',
          columns: [
            { name: 'id', type: 'int', options: { autoIncrement: true } },
            { name: 'user_id', type: 'int' },
          ],
          primaryKey: 'id',
          foreignKeys: [
            {
              column: 'user_id',
              reference: 'users(id)',
              onDelete: 'CASCADE',
            },
          ],
        })
      ).resolves.toBeUndefined();
    });
  });
});
