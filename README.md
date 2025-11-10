# Atlas MySQL

[![npm version](https://badge.fury.io/js/atlas-mysql.svg)](https://badge.fury.io/js/atlas-mysql)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A type-safe MySQL ORM for Node.js applications. It provides query building, transaction support, and logging to help you work with MySQL databases using TypeScript.

## Features

- Type-safe queries with TypeScript support
- Flexible query builder with method chaining
- Transaction management with automatic rollback
- Connection pooling using mysql2
- Query logging with performance tracking
- Parameterized queries to help prevent SQL injection
- Schema management for creating tables
- Environment variable configuration
- Detailed error reporting


## Installation

```bash
npm install atlas-mysql mysql2
```

Or with yarn:

```bash
yarn add atlas-mysql mysql2
```

## Quick Start

### Basic Setup

```typescript
import { MySQLORM, createMySQLORMFromEnv } from 'atlas-mysql';

// Option 1: Create from environment variables
// Set DB_USER, DB_PASS, DB_HOST, DB_NAME, DB_PORT in your .env file
const orm = createMySQLORMFromEnv();

// Option 2: Create with explicit configuration
const orm = new MySQLORM({
  host: 'localhost',
  user: 'myuser',
  password: 'mypassword',
  database: 'mydatabase',
  port: 3306,
  connectionLimit: 10,
});

// Quick type-safe example
interface User {
  id: number;
  name: string;
  email: string;
}

const { rows: users } = await orm.getData<User>({
  table: 'users',
  idField: 'user_id',
  fields: { id: 'user_id', name: 'full_name', email: 'email_address' },
  limit: 10,
});

// TypeScript provides full IntelliSense support for the returned data
users.forEach(user => console.log(`${user.name}: ${user.email}`));
```

### Environment Variables

Create a `.env` file in your project root:

```env
DB_HOST=localhost
DB_USER=your_username
DB_PASS=your_password
DB_NAME=your_database
DB_PORT=3306

# Optional query logging configuration
QUERY_LOGGING_ENABLED=true
QUERY_LOG_TO_FILE=true
QUERY_LOG_PATH=./logs/queries.log
SLOW_QUERY_THRESHOLD=1000
NODE_ENV=development
```

## Usage Examples

### Basic Queries

```typescript
import { MySQLORM, QueryConfig } from 'atlas-mysql';

const orm = new MySQLORM(config);

// Define query configuration
const userQuery: QueryConfig = {
  table: 'users',
  idField: 'user_id',
  fields: {
    id: 'user_id',
    name: 'full_name',
    email: 'email_address',
    active: 'is_active',
  },
  where: ['is_active = ?', 'created_at > ?'],
  orderBy: 'created_at',
  orderDirection: 'DESC',
  limit: 50,
};

// Get multiple records with total count
const { rows, count } = await orm.getData(userQuery, [1, '2023-01-01']);
console.log(`Found ${count} users, showing ${rows.length}`);

// Get first matching record
const user = await orm.getFirst(userQuery, [1, '2023-01-01']);
if (user) {
  console.log(`User: ${user.name} (${user.email})`);
}

// Exclude records using WHERE NOT
const activeUsersQuery: QueryConfig = {
  table: 'users',
  idField: 'user_id',
  fields: {
    id: 'user_id',
    name: 'full_name',
    email: 'email_address',
  },
  where: ['is_active = ?'],
  whereNot: ['is_deleted = ?', 'is_banned = ?'],
  orderBy: 'created_at',
  orderDirection: 'DESC',
};

// Gets active users that are not deleted and not banned
const { rows: activeUsers } = await orm.getData(activeUsersQuery, [1, 1, 1]);
```

### Advanced Query Building

```typescript
// Complex query with JOINs and GROUP BY
const salesQuery: QueryConfig = {
  table: 'orders',
  idField: 'order_id',
  fields: {
    userId: 'orders.user_id',
    userName: 'users.full_name',
    totalOrders: 'COUNT(orders.order_id)',
    totalAmount: 'SUM(orders.total_amount)',
    avgAmount: 'AVG(orders.total_amount)',
  },
  joins: [
    {
      type: 'INNER',
      table: 'users',
      on: 'orders.user_id = users.user_id',
    },
    {
      type: 'LEFT',
      table: 'user_profiles',
      on: 'users.user_id = user_profiles.user_id',
    },
  ],
  where: ['orders.status = ?', 'orders.created_at >= ?'],
  groupBy: ['orders.user_id', 'users.full_name'],
  having: {
    'COUNT(orders.order_id)': 5, // Users with more than 5 orders
  },
  orderBy: 'totalAmount',
  orderDirection: 'DESC',
  limit: 100,
};

const salesData = await orm.getData(salesQuery, ['completed', '2023-01-01']);
```

### Subqueries

Atlas MySQL supports subqueries in the SELECT clause, allowing you to nest queries for complex data retrieval:

```typescript
// Using subqueries to get aggregated data alongside main query results
const userStatsQuery: QueryConfig = {
  table: 'users',
  idField: 'user_id',
  fields: {
    id: 'users.user_id',
    name: 'users.full_name',
    email: 'users.email_address',
    // Subquery to count total orders per user
    totalOrders: {
      table: 'orders',
      idField: 'order_id',
      fields: {
        count: 'COUNT(order_id)',
      },
      where: ['orders.user_id = users.user_id'],
    },
    // Subquery to calculate total spent
    totalSpent: {
      table: 'orders',
      idField: 'order_id',
      fields: {
        sum: 'SUM(total_amount)',
      },
      where: ['orders.user_id = users.user_id', 'orders.status = ?'],
    },
  },
  where: ['users.is_active = ?'],
  orderBy: 'users.created_at',
  orderDirection: 'DESC',
  limit: 50,
};

const { rows: userStats } = await orm.getData(userStatsQuery, ['completed', 1]);
// Results include main query data plus subquery results
userStats.forEach(user => {
  console.log(`${user.name}: ${user.totalOrders} orders, spent $${user.totalSpent}`);
});
```

#### Subquery with Multiple Conditions

```typescript
// Complex example with multiple subqueries and conditions
const productAnalysisQuery: QueryConfig = {
  table: 'products',
  idField: 'product_id',
  fields: {
    productId: 'products.product_id',
    productName: 'products.name',
    category: 'products.category',
    // Subquery for recent sales count (last 30 days)
    recentSales: {
      table: 'order_items',
      idField: 'item_id',
      fields: {
        count: 'COUNT(item_id)',
      },
      where: [
        'order_items.product_id = products.product_id',
        'order_items.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
      ],
    },
    // Subquery for average rating
    avgRating: {
      table: 'reviews',
      idField: 'review_id',
      fields: {
        avg: 'AVG(rating)',
      },
      where: ['reviews.product_id = products.product_id'],
    },
  },
  where: ['products.is_active = ?'],
  orderBy: 'products.name',
  limit: 100,
};

const { rows: products } = await orm.getData(productAnalysisQuery, [1]);
```

#### Subquery Best Practices

When using subqueries:
- Ensure subquery WHERE clauses reference the parent table correctly
- Keep subqueries simple for better performance
- Consider using JOINs with GROUP BY as an alternative for complex aggregations
- Test query performance with EXPLAIN for large datasets
- Use appropriate indexes on columns referenced in subquery WHERE clauses

### Type-Safe Queries with TypeScript

Atlas MySQL provides TypeScript support with type inference for your database operations:

```typescript
import { MySQLORM, QueryConfig } from 'atlas-mysql';

// Define your database entity interfaces
interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

interface UserDbRow {
  user_id: number;
  full_name: string;
  email_address: string;
  is_active: number;
  created_at: string;
  updated_at: string | null;
}

interface SalesReport {
  userId: number;
  userName: string;
  totalOrders: number;
  totalAmount: number;
  avgAmount: number;
}

const orm = new MySQLORM(config);

// Type-safe user query with proper return types
const userQuery: QueryConfig = {
  table: 'users',
  idField: 'user_id',
  fields: {
    id: 'user_id',
    name: 'full_name',
    email: 'email_address',
    active: 'is_active',
    createdAt: 'created_at',
  },
  where: ['is_active = ?', 'created_at > ?'],
  orderBy: 'created_at',
  orderDirection: 'DESC',
  limit: 50,
};

// getData with proper typing - returns typed results
const { rows: users, count } = await orm.getData<User>(userQuery, [1, '2023-01-01']);
users.forEach(user => {
  // TypeScript knows user is of type User
  console.log(`${user.name} (${user.email}) - Active: ${user.active}`);
  // user.id is typed as number
  // user.name is typed as string
  // user.email is typed as string
  // user.active is typed as boolean
});

// getFirst with proper typing - returns typed result or null
const user = await orm.getFirst<User>(userQuery, [1, '2023-01-01']);
if (user) {
  // TypeScript knows user is of type User (not null)
  console.log(`Found user: ${user.name} with ID ${user.id}`);
  // Full IntelliSense support for user properties
}

// Complex typed query for sales reports
const salesQuery: QueryConfig = {
  table: 'orders',
  idField: 'order_id',
  fields: {
    userId: 'orders.user_id',
    userName: 'users.full_name',
    totalOrders: 'COUNT(orders.order_id)',
    totalAmount: 'SUM(orders.total_amount)',
    avgAmount: 'AVG(orders.total_amount)',
  },
  joins: [
    {
      type: 'INNER',
      table: 'users',
      on: 'orders.user_id = users.user_id',
    },
  ],
  where: ['orders.status = ?'],
  groupBy: ['orders.user_id', 'users.full_name'],
  orderBy: 'totalAmount',
  orderDirection: 'DESC',
  limit: 10,
};

// Type-safe sales report query
const { rows: salesReports } = await orm.getData<SalesReport>(salesQuery, ['completed']);
salesReports.forEach(report => {
  // Full type safety and IntelliSense
  console.log(`${report.userName}: ${report.totalOrders} orders, $${report.totalAmount.toFixed(2)} total`);
  // TypeScript knows:
  // report.userId is number
  // report.userName is string
  // report.totalOrders is number
  // report.totalAmount is number (can call .toFixed())
});

// Type-safe raw queries
interface ProductSales {
  productName: string;
  category: string;
  totalSales: number;
  averagePrice: number;
}

const productSales = await orm.rawQuery<ProductSales>(
  `
  SELECT 
    p.name as productName,
    p.category,
    SUM(oi.quantity * oi.price) as totalSales,
    AVG(oi.price) as averagePrice
  FROM order_items oi
  JOIN products p ON oi.product_id = p.product_id
  WHERE oi.created_at >= ?
  GROUP BY p.product_id, p.name, p.category
  ORDER BY totalSales DESC
  LIMIT 20
  `,
  ['2023-01-01']
);

// Full type safety on results
productSales.forEach(product => {
  console.log(`${product.productName} (${product.category}): $${product.totalSales}`);
  // TypeScript provides full IntelliSense and type checking
});
```

### Database Entity Mapping

Create interfaces that match your database structure for maximum type safety:

```typescript
// Database table interface (matches actual DB columns)
interface UserTable {
  user_id: number;
  full_name: string;
  email_address: string;
  is_active: 0 | 1;
  created_at: string;
  updated_at: string | null;
  profile_picture: string | null;
}

// Application domain interface (what your app uses)
interface UserEntity {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date | null;
  profilePicture: string | null;
}

// Query configuration with field mapping
const userEntityQuery: QueryConfig = {
  table: 'users',
  idField: 'user_id',
  fields: {
    id: 'user_id',
    name: 'full_name',
    email: 'email_address',
    isActive: 'is_active',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    profilePicture: 'profile_picture',
  },
  where: ['is_active = ?'],
  orderBy: 'created_at',
  orderDirection: 'DESC',
};

// Type-safe query with automatic mapping
const activeUsers = await orm.getData<UserEntity>(userEntityQuery, [1]);

// Transform dates from strings to Date objects if needed
const usersWithDates: UserEntity[] = activeUsers.rows.map(user => ({
  ...user,
  createdAt: new Date(user.createdAt as unknown as string),
  updatedAt: user.updatedAt ? new Date(user.updatedAt as unknown as string) : null,
  isActive: Boolean(user.isActive),
}));
```

### Type-Safe CRUD Operations

```typescript
// Define interfaces for type-safe CRUD operations
interface CreateUserData {
  full_name: string;
  email_address: string;
  is_active: 0 | 1;
  created_at: string;
  profile_picture?: string | null;
}

interface UpdateUserData {
  full_name?: string;
  email_address?: string;
  is_active?: 0 | 1;
  updated_at: string;
  profile_picture?: string | null;
}

interface DeleteUserConditions {
  user_id: number;
  is_active?: 0 | 1;
}

// Type-safe insert with interface
const newUserData: CreateUserData = {
  full_name: 'John Doe',
  email_address: 'john@example.com',
  is_active: 1,
  created_at: new Date().toISOString(),
};

const userId = await orm.insertData('users', newUserData);
console.log(`Created user with ID: ${userId}`);

// Type-safe update with partial interface
const updateData: UpdateUserData = {
  full_name: 'John Smith',
  updated_at: new Date().toISOString(),
};

const affectedRows = await orm.updateData({
  table: 'users',
  data: updateData,
  where: ['user_id = ?'],
  values: [userId],
});
console.log(`Updated ${affectedRows} rows`);

// Type-safe delete with conditions interface
const deleteConditions: DeleteUserConditions = {
  user_id: userId,
  is_active: 0,
};

const deletedRows = await orm.deleteData('users', deleteConditions);
console.log(`Deleted ${deletedRows} rows`);

// Batch operations with type safety
interface BatchCreateUser {
  full_name: string;
  email_address: string;
  is_active: 1;
  created_at: string;
}

const batchUsers: BatchCreateUser[] = [
  {
    full_name: 'Alice Johnson',
    email_address: 'alice@example.com',
    is_active: 1,
    created_at: new Date().toISOString(),
  },
  {
    full_name: 'Bob Wilson',
    email_address: 'bob@example.com',
    is_active: 1,
    created_at: new Date().toISOString(),
  },
];

// Type-safe batch insert (using transaction)
const createdUserIds = await orm.withTransaction(async (transaction) => {
  const ids: number[] = [];
  for (const userData of batchUsers) {
    const id = await orm.insertData('users', userData, transaction);
    ids.push(id);
  }
  return ids;
});

console.log(`Created ${createdUserIds.length} users: ${createdUserIds.join(', ')}`)
```

### Raw SQL Queries

```typescript
// Execute raw SQL for complex operations
interface CustomResult {
  category: string;
  total_sales: number;
  avg_price: number;
}

const results = await orm.rawQuery<CustomResult>(
  `
  SELECT 
    p.category,
    SUM(oi.quantity * oi.price) as total_sales,
    AVG(oi.price) as avg_price
  FROM order_items oi
  JOIN products p ON oi.product_id = p.product_id
  WHERE oi.created_at >= ?
  GROUP BY p.category
  HAVING total_sales > ?
  ORDER BY total_sales DESC
  `,
  ['2023-01-01', 10000]
);

results.forEach(result => {
  console.log(`${result.category}: $${result.total_sales} (avg: $${result.avg_price})`);
});
```

## 🔄 Transaction Management

### Using withTransaction (Recommended)

```typescript
// Automatic transaction management
const result = await orm.withTransaction(async (transaction) => {
  // Insert order
  const orderId = await orm.insertData('orders', {
    user_id: 123,
    total_amount: 299.99,
    status: 'pending',
  }, transaction);

  // Insert order items
  for (const item of items) {
    await orm.insertData('order_items', {
      order_id: orderId,
      product_id: item.productId,
      quantity: item.quantity,
      price: item.price,
    }, transaction);
  }

  // Update inventory
  await orm.updateData({
    table: 'products',
    data: { stock_quantity: item.newStock },
    where: ['product_id = ?'],
    values: [item.productId],
    transaction,
  });

  return orderId;
});

console.log(`Order created with ID: ${result}`);
```

### Manual Transaction Control

```typescript
const transaction = orm.createTransaction();

try {
  await transaction.begin();
  
  const userId = await orm.insertData('users', userData, transaction);
  await orm.insertData('user_profiles', { user_id: userId, ...profileData }, transaction);
  
  await transaction.commit();
  console.log('Transaction completed successfully');
} catch (error) {
  await transaction.rollback();
  console.error('Transaction failed:', error);
  throw error;
}
```

## 🗃️ Schema Management

### Creating Tables

```typescript
import { CreateTableConfig } from 'atlas-mysql';

const tableConfig: CreateTableConfig = {
  table: 'users',
  dropIfExists: true,
  columns: [
    {
      name: 'user_id',
      type: 'int',
      options: {
        autoIncrement: true,
        unsigned: true,
      },
    },
    {
      name: 'email',
      type: 'varchar',
      options: {
        length: 255,
        nullable: false,
      },
    },
    {
      name: 'full_name',
      type: 'varchar',
      options: {
        length: 200,
        nullable: false,
      },
    },
    {
      name: 'status',
      type: 'enum',
      options: {
        enum: ['active', 'inactive', 'pending'],
        default: 'pending',
      },
    },
    {
      name: 'created_at',
      type: 'timestamp',
      options: {
        default: 'CURRENT_TIMESTAMP',
      },
    },
    {
      name: 'updated_at',
      type: 'timestamp',
      options: {
        default: 'CURRENT_TIMESTAMP',
        onUpdate: 'CURRENT_TIMESTAMP',
      },
    },
  ],
  primaryKey: 'user_id',
  indexes: [
    {
      type: 'UNIQUE',
      columns: ['email'],
    },
    {
      columns: ['status', 'created_at'],
    },
  ],
  foreignKeys: [
    {
      column: 'department_id',
      reference: 'departments(department_id)',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
  ],
  tableOptions: {
    engine: 'InnoDB',
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
    comment: 'User accounts table',
  },
};

await orm.createTable(tableConfig);
```

## Query Logging and Monitoring

Atlas MySQL includes query logging to help you track performance and debug issues:

```typescript
import { getQueryLogger, initialiseQueryLogger } from 'atlas-mysql';

// Initialise with custom configuration
const logger = initialiseQueryLogger({
  enabled: true,
  logToFile: true,
  logToConsole: true,
  logFilePath: './logs/database.log',
  slowQueryThreshold: 500, // Log queries taking > 500ms as warnings
  maxFileSize: 50 * 1024 * 1024, // 50MB max file size
  rotateOnSize: true,
});

// The logger automatically tracks:
// - Query execution time
// - Parameter values
// - Slow query detection
// - Error logging with stack traces
// - Query success/failure rates
```

### Log Output Examples

```
[2023-12-07T10:30:45.123Z] [INFO] [245ms] SELECT `user_id` AS `id`, `full_name` AS `name` FROM `users` WHERE is_active = ? ORDER BY `user_id` ASC LIMIT 10 | Values: [1]

[2023-12-07T10:30:46.456Z] [WARN] [1250ms] SELECT COUNT(`user_id`) AS count FROM `orders` WHERE created_at >= ? | Values: ["2023-01-01"]

[2023-12-07T10:30:47.789Z] [ERROR] INSERT INTO `users` (`email`, `full_name`) VALUES (?, ?) | Values: ["test@example.com", "Test User"] | Error: Duplicate entry 'test@example.com' for key 'email'
```

## Configuration Options

### MySQL ORM Configuration

```typescript
interface MySQLORMConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port?: number;                    // Default: 3306
  connectionLimit?: number;         // Default: 10
  maxIdle?: number;                // Default: 10
  idleTimeout?: number;            // Default: 60000ms
  queueLimit?: number;             // Default: 0 (unlimited)
  enableKeepAlive?: boolean;       // Default: true
  keepAliveInitialDelay?: number;  // Default: 0
}
```

### Query Logger Configuration

```typescript
interface QueryLoggerConfig {
  enabled: boolean;                // Enable/disable logging
  logToFile: boolean;             // Write to log file
  logToConsole: boolean;          // Write to console
  logFilePath: string;            // Path to log file
  slowQueryThreshold: number;     // Slow query threshold (ms)
  maxFileSize: number;            // Max log file size (bytes)
  rotateOnSize: boolean;          // Enable log rotation
}
```

## 🔒 Security Features

### SQL Injection Prevention

Atlas MySQL uses parameterised queries throughout:

```typescript
// ✅ Safe - uses parameterised queries
const users = await orm.getData({
  table: 'users',
  idField: 'user_id',
  fields: { id: 'user_id', name: 'full_name' },
  where: ['email = ?', 'status = ?'],
}, [userEmail, 'active']);

// ✅ Safe - automatic escaping
const userId = await orm.insertData('users', {
  email: userInput.email,
  name: userInput.name,
});
```

### Input Validation

```typescript
// The ORM automatically validates and sanitizes:
// - Numeric limits and offsets
// - Table and column names (using escapeId)
// - Parameter values (using parameterised queries)
// - SQL injection attempts
```

## Testing

Atlas MySQL includes test coverage using Vitest:

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Example Test

```typescript
import { MySQLORM } from 'atlas-mysql';

describe('MySQLORM', () => {
  let orm: MySQLORM;

  beforeEach(() => {
    orm = new MySQLORM(testConfig);
  });

  it('should fetch user data', async () => {
    const result = await orm.getData({
      table: 'users',
      idField: 'user_id',
      fields: { id: 'user_id', name: 'full_name' },
    });

    expect(result.rows).toBeDefined();
    expect(result.count).toBeGreaterThanOrEqual(0);
  });
});
```

## Performance Tips

Here are some things that can help improve performance:

1. **Use Connection Pooling**: Set appropriate connection limits for your application
2. **Index Your Queries**: Make sure your WHERE clauses use indexed columns
3. **Monitor Slow Queries**: Use the built-in logging to find bottlenecks
4. **Batch Operations**: Use transactions for multiple related operations
5. **Limit Result Sets**: Use LIMIT clauses to avoid fetching too much data
6. **Cache When Appropriate**: Consider caching for frequently accessed data

## Migration from Other ORMs

### From Sequelize

```typescript
// Sequelize
const users = await User.findAll({
  where: { status: 'active' },
  limit: 10,
  order: [['created_at', 'DESC']],
});

// Atlas MySQL
const { rows: users } = await orm.getData({
  table: 'users',
  idField: 'user_id',
  fields: { id: 'user_id', name: 'full_name', status: 'status' },
  where: ['status = ?'],
  orderBy: 'created_at',
  orderDirection: 'DESC',
  limit: 10,
}, ['active']);
```

### From TypeORM

```typescript
// TypeORM
const users = await userRepository
  .createQueryBuilder('user')
  .where('user.status = :status', { status: 'active' })
  .orderBy('user.created_at', 'DESC')
  .take(10)
  .getMany();

// Atlas MySQL
const { rows: users } = await orm.getData({
  table: 'users',
  idField: 'user_id',
  fields: { id: 'user_id', name: 'full_name', status: 'status' },
  where: ['status = ?'],
  orderBy: 'created_at',
  orderDirection: 'DESC',
  limit: 10,
}, ['active']);
```


## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/mattthehat/atlas-mysql/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mattthehat/atlas-mysql/discussions)

## Acknowledgments

- Built on top of the excellent [mysql2](https://github.com/sidorares/node-mysql2) library
- Inspired by modern ORM patterns and best practices
- Thanks to all contributors and the open-source community

---

**Made with ❤️ by the Atlas team**