# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of QueryCraft MySQL
- Type-safe MySQL ORM with comprehensive TypeScript support
- Flexible query builder with method chaining
- Transaction management with automatic rollback
- Connection pooling using mysql2
- Comprehensive query logging and performance monitoring
- SQL injection protection with parameterized queries
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
- Parameterized queries prevent SQL injection
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

This is the first stable release of QueryCraft MySQL, a powerful and type-safe MySQL ORM for Node.js applications.

**Key Features:**
- 🔒 **Security First**: Built-in SQL injection protection
- 🚀 **Performance**: Optimized connection pooling and query execution
- 🔧 **Developer Friendly**: Full TypeScript support and comprehensive logging
- 📊 **Monitoring**: Built-in query performance tracking
- 🔄 **Transactions**: Robust transaction management
- 📝 **Documentation**: Extensive documentation and examples

**Getting Started:**
```bash
npm install querycraft-mysql mysql2
```

**Basic Usage:**
```typescript
import { MySQLORM } from 'querycraft-mysql';

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