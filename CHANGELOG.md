# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [4.1.0] - 2026-06-10

### Added
- **Typed fields via `col<T>()`**: wrap a selected field with `col<number>('user_id')` to give it a
  real inferred value type — so `getData()`/`getFirst()` results have typed values (`number`, `Date`,
  …) without a schema or codegen. Plain string fields continue to infer as `unknown`. `col()` also
  handles SQL expressions (`col<number>('COUNT(*)')`) and resolves as an alias in `where`/`orderBy`.
- Exported `col`, plus types `TypedColumn`, `FieldMap`, `InferRow`, `InferFieldValue`, `ResolvedRow`,
  `InferredQueryConfig`, and the structured-where types (`WhereCondition`, `WhereOperator`,
  `WhereScalar`, `WhereEntry`).

## [4.0.0] - 2026-06-10

### Added
- **Inferred result types**: `getData()` and `getFirst()` now derive the returned row shape
  directly from the `fields` you select — no schema, no codegen, no generic required. The
  selected aliases become the row keys (with autocomplete and typo-catching on access); value
  types are `unknown` since column types aren't known without a schema. Pass an explicit row
  type (`getData<User>(...)`) to fully type values, or use `satisfies QueryConfig<User>` on the
  config to validate that `fields` keys belong to your interface.
- New exported helper types: `FieldMap`, `InferRow`, `ResolvedRow`, `InferredQueryConfig`.

### Changed
- **BREAKING (types)**: `getData()` / `getFirst()` no longer return `Record<string, any>`-style
  rows when called without a type argument. They now return rows keyed by the selected `fields`
  with `unknown` values. Code that read arbitrary/loose properties off untyped results may need to
  narrow values or pass an explicit `<T>`. Runtime behaviour is unchanged.
- **BREAKING (types)**: the method-level generic on `getData<T>()` / `getFirst<T>()` overrides the
  inferred row type but no longer constrains `fields` keys to `keyof T`. To keep alias-key
  validation against an interface, type the config with `satisfies QueryConfig<T>` (still supported).

## [3.1.0] - 2026-06-09

### Added
- **Structured WHERE conditions**: `where` now accepts `{ column, op, value }` objects alongside
  raw SQL strings. Columns are alias-resolved and escaped, operators are validated against a fixed
  allow-list, and all values are bound as `?` placeholders — eliminating the raw-SQL injection
  surface for filters. Supports `=`, `!=`, `<>`, `<`, `>`, `<=`, `>=`, `<=>`, `LIKE`, `NOT LIKE`,
  `IN`, `NOT IN`, `IS NULL`, `IS NOT NULL`, `BETWEEN`, `NOT BETWEEN`, with safe handling of empty
  `IN`/`NOT IN`. Backward compatible — existing raw-string `where` arrays are unchanged.
- **Injectable logging sink**: `QueryLoggerConfig.logger` lets you route console output to a custom
  `{ log, error }` sink (defaults to the global `console`).

### Changed
- **`chalk` is no longer a runtime dependency.** Console colouring is handled by a tiny internal
  zero-dependency helper that respects `NO_COLOR`/`FORCE_COLOR` and TTY detection. The only runtime
  dependency is now `mysql2`.

### Docs
- Repositioned as a **typed query builder** rather than a full ORM; documented that `getData<T>()`
  result typing is a compile-time convenience, not a runtime guarantee (rows are cast, not validated).
- Reframed the SQL-injection section around parameter binding + structured conditions, with the
  raw-string `validateSqlClause` pattern check described as defence-in-depth, not a primary control.

## [3.0.0] - 2026-06-09

### Added
- **Generic-aware field aliases**: `QueryConfig<T>` constrains the keys of `fields` to `keyof T`.
  When a row type is supplied via `getData<T>()` / `getFirst<T>()` (or by typing the config as
  `QueryConfig<T>`), a typo'd or unknown alias becomes a **compile-time error** instead of a silent
  runtime mismatch. With no generic, `T` defaults to `Record<string, any>` and any string key is
  allowed, so untyped queries are unaffected.

### Changed
- **BREAKING (types)**: `QueryConfig` is now generic (`QueryConfig<T = Record<string, any>>`).
  Existing typed callers (`getData<User>(...)`) whose `fields` contained a key not present on the
  row type will now fail to compile. Untyped usage and runtime behaviour are unchanged.
- **BREAKING (types)**: Removed `'FULL'` from the `joins[].type` union (in both `QueryConfig` and
  `VectorSearchConfig`). MySQL does not support `FULL JOIN`, so this only ever failed at runtime.
- **BREAKING (behaviour)**: Row counts are now accurate for grouped and nullable-id queries —
  see Fixed. Code relying on the previous (incorrect) count values will observe different numbers.

### Fixed
- **Count accuracy**: `getData()` now uses `COUNT(*)` (NULL-safe) instead of `COUNT(idField)`, and
  `COUNT(DISTINCT idField)` when `distinct` is set. Queries with `groupBy` now count the number of
  groups (via a wrapped derived table) instead of returning the first group's tally.
- **Subquery parameters**: bound values from a SELECT subquery's `whereIn` / `whereNotIn` are now
  propagated to the outer query, fixing placeholder/value count mismatches.
- **SQL-validation regex statefulness**: hoisted validation patterns no longer use the `/g` flag,
  removing a latent `lastIndex` bug that could intermittently skip matches.

### Performance
- SQL-injection validation patterns are compiled once at module load instead of being re-allocated
  (~37 `RegExp` objects) on every clause validation.
- `SELECT` column lists are assembled with array `join` instead of repeated string concatenation,
  and `ORDER BY` direction parsing uses a single regex pass.

### Internal
- Fixed the ESLint config (`plugin:@typescript-eslint/recommended`) so linting runs again; pinned
  `types: ["node"]` in `tsconfig.json`; updated in-range dependencies (including `mysql2` 3.22.5).

## [2.1.0] - 2026-03-10

### Added
- **Vector Semantic Search**: K-nearest-neighbour similarity queries using MySQL vector columns
  - New `vectorSearch()` method for similarity-based lookups
  - `orderByVector` option in `getData()` for vector-ordered results
  - `VECTOR(n)` column type and `VECTOR` index support in `createTable()`
  - `vectorToString()` and `stringToVector()` static utility methods
  - New types: `VectorDistanceMetric`, `VectorSearchConfig`, `VectorSearchResult`
  - 24 new tests covering all vector search functionality (130 tests total)

## [2.0.0] - 2026-02-15

### Added
- **Enhanced SQL Injection Prevention**: Strengthened validation across all query inputs

### Changed
- **BREAKING**: `batchInsertData()` now returns `{ firstInsertId, affectedRows }` instead of an array of IDs

### Fixed
- Improved query logging reliability
- TINYINT cast handling

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