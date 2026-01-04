# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-01-04

### Added
- **Field Alias Resolution**: Automatic resolution of field aliases in WHERE, ORDER BY, whereIn, and whereNotIn clauses
  - No configuration required - aliases are resolved automatically
  - Works with all SQL operators (=, !=, <, >, <=, >=, LIKE, etc.)
  - Example: Use `name` alias instead of `full_name` in all query clauses

- **DISTINCT Support**: Query unique values with the `distinct` option
  - Add `distinct: true` to QueryConfig
  - Works with COUNT queries for accurate distinct counts
  - Combines with WHERE, ORDER BY, and other query options

- **whereNotIn Support**: Exclude multiple values efficiently
  - New `whereNotIn` property in QueryConfig
  - Accepts object with field keys and array values
  - Works with alias resolution
  - Example: `whereNotIn: { status: ['deleted', 'banned'] }`

- **Enhanced HAVING Clause**: Full operator support in HAVING conditions
  - Changed from object to array format
  - Supports all comparison operators (>, <, >=, <=, !=, etc.)
  - Example: `having: ['COUNT(order_id) >= 5', 'SUM(amount) > 1000']`

- **Explicit Raw SQL Markers**: Use `{ raw: 'SQL' }` for calculated fields
  - Clear distinction between column names and SQL expressions
  - Example: `age: { raw: 'TIMESTAMPDIFF(YEAR, birth_date, CURDATE())' }`
  - Works with any MySQL function or expression

- **Batch Insert**: High-performance multi-row inserts
  - New `batchInsertData()` method
  - Insert multiple records in a single query
  - Returns array of all insert IDs
  - Supports transactions
  - 10-100x faster than individual inserts for bulk operations

- **Multiple ORDER BY Directions**: Sort by multiple columns with different directions
  - Object notation: `[{ column: 'price', direction: 'DESC' }, { column: 'name', direction: 'ASC' }]`
  - String notation: `['price DESC', 'name ASC']`
  - Array with shared direction: `orderBy: ['category', 'name'], orderDirection: 'ASC'`

- **Enhanced Security**: JOIN ON clause validation
  - Automatic detection and rejection of SQL injection attempts
  - Validates against dangerous keywords (DROP, DELETE, INSERT, UNION, etc.)
  - Blocks SQL comment patterns and statement separators
  - Throws clear error messages for invalid patterns

### Changed
- **BREAKING**: HAVING clause changed from object to array format
  - Old: `having: { 'COUNT(orders)': 5 }`
  - New: `having: ['COUNT(orders) >= 5']`
  - Enables full operator support instead of just equality

### Improved
- Better TypeScript type safety across all new features
- Comprehensive test coverage for all new functionality
- Extensive documentation with real-world examples
- Enhanced error messages for better debugging

### Migration Guide from v1.4.0

#### HAVING Clause
```typescript
// Before (v1.4.0):
having: {
  'COUNT(orders)': 5,
  'SUM(amount)': 1000
}

// After (v1.5.0):
having: [
  'COUNT(orders) >= 5',    // Now supports all operators!
  'SUM(amount) > 1000'
]
```

#### Field Aliases (New Feature - No Migration Needed)
```typescript
// v1.5.0: Use friendly aliases throughout your queries
const query: QueryConfig = {
  fields: {
    name: 'full_name',
    email: 'email_address',
  },
  where: ['name LIKE ?'],      // Automatically resolves to full_name
  orderBy: 'email',             // Automatically resolves to email_address
  whereNotIn: { name: [...] }   // Works with aliases too!
};
```

## [1.3.0] - 2025-11-15

### Removed
- **BREAKING CHANGE**: Removed `whereNot` functionality from QueryConfig interface
  - The `whereNot` feature was deemed redundant and potentially confusing
  - Users should now use standard SQL operators like `!=`, `NOT IN`, `IS NOT NULL` in regular `where` clauses

### Added  
- Enhanced documentation with comprehensive WHERE clause examples
- New examples showing all SQL comparison operators (`>=`, `<=`, `!=`, `>`, `=`, `BETWEEN`, `LIKE`)
- Examples for NULL checks (`IS NOT NULL`, `IS NULL`)
- Examples for IN and NOT IN operators
- More practical filtering examples in documentation

### Changed
- Updated test suite to demonstrate proper use of `!=` and other comparison operators
- Improved documentation structure for better readability

### Migration Guide
If you were using `whereNot`, replace it with equivalent `where` conditions:

```typescript
// Before (removed):
whereNot: ['is_deleted = ?', 'is_banned = ?']

// After (recommended):
where: ['is_deleted != ?', 'is_banned != ?']
```

## [1.2.1] - Previous Release

### Added
- Initial release of Atlas MySQL
- Type-safe MySQL ORM with comprehensive TypeScript support
- Flexible query builder with method chaining
- Transaction management with automatic rollback
- Connection pooling using mysql2
- Comprehensive query logging and performance monitoring
- SQL injection protection with parameterised queries
- Schema management for table creation
- Environment-based configuration
- Detailed error handling and reporting

### Features
- **MySQLORM Class**: Main ORM class for database operations
- **QueryConfig Interface**: Type-safe query configuration
- **Transaction Support**: Built-in transaction management
- **Query Logger**: Comprehensive logging with file rotation
- **Schema Builder**: Create tables programmatically
- **Raw Query Support**: Execute custom SQL queries
- **Connection Management**: Efficient connection pooling

### API Methods
- `getData<T>()`: Fetch multiple records with count
- `getFirst<T>()`: Get first matching record
- `insertData()`: Insert new records
- `updateData()`: Update existing records
- `deleteData()`: Delete records
- `rawQuery<T>()`: Execute raw SQL queries
- `createTable()`: Create database tables
- `withTransaction()`: Execute operations in transaction
- `createTransaction()`: Manual transaction control

### Security
- Parameterised queries prevent SQL injection
- Input validation and sanitization
- Secure connection management
- Environment variable configuration

### Performance
- Connection pooling for efficient resource usage
- Query performance monitoring
- Slow query detection and logging
- Configurable connection limits and timeouts

### Developer Experience
- Full TypeScript support with type definitions
- Comprehensive documentation and examples
- Detailed error messages and stack traces
- Development-friendly logging
- ESLint and Prettier configuration
- Comprehensive test coverage

## [1.0.0] - 2024-12-07

### Added
- Initial stable release
- Complete MySQL ORM functionality
- Production-ready codebase
- Comprehensive documentation
- Full test coverage
- CI/CD pipeline setup

---

## Release Notes

### v1.0.0 - Initial Release

This is the first stable release of Atlas MySQL, a powerful and type-safe MySQL ORM for Node.js applications.

**Key Features:**
- **Security First**: Built-in SQL injection protection
- **Performance**: Optimized connection pooling and query execution
- **Developer Friendly**: Full TypeScript support and comprehensive logging
- **Monitoring**: Built-in query performance tracking
- **Transactions**: Robust transaction management
- **Documentation**: Extensive documentation and examples

**Getting Started:**
```bash
npm install atlas-mysql mysql2
```

**Basic Usage:**
```typescript
import { MySQLORM } from 'atlas-mysql';

const orm = new MySQLORM({
  host: 'localhost',
  user: 'username',
  password: 'password',
  database: 'mydb'
});

const users = await orm.getData({
  table: 'users',
  idField: 'user_id',
  fields: { id: 'user_id', name: 'full_name' }
});
```

We welcome feedback, bug reports, and contributions from the community!

---

For more details about each release, see the individual release notes on GitHub.