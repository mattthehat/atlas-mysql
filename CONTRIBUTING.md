# Contributing to QueryCraft MySQL

Thank you for your interest in contributing to QueryCraft MySQL! We welcome contributions from the community and are pleased to have you join us.

## 🚀 Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn
- MySQL 5.7+ or MySQL 8.0+
- Git

### Development Setup

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/querycraft-mysql.git
   cd querycraft-mysql
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Run tests**
   ```bash
   npm test
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

## 🏗️ Development Workflow

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check formatting
npm run format:check

# Fix formatting
npm run format

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Testing

- Write tests for all new features and bug fixes
- Ensure all tests pass before submitting a PR
- Aim for 90%+ test coverage

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Building

```bash
# Clean build directory
npm run clean

# Build TypeScript
npm run build

# Build in watch mode
npm run build:watch
```

## 📝 Submitting Changes

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools

Examples:
```
feat(orm): add support for JSON column type
fix(query): resolve issue with nested WHERE conditions
docs(readme): update installation instructions
test(transaction): add comprehensive transaction tests
```

### Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**
   ```bash
   npm test
   npm run lint
   npm run format:check
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Use a clear and descriptive title
   - Provide a detailed description of your changes
   - Link any relevant issues
   - Add screenshots or examples if applicable

### Pull Request Template

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Tests pass locally
- [ ] New tests added for new functionality
- [ ] Coverage maintained or improved

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Documentation updated (if needed)
- [ ] No new warnings or errors introduced
```

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

1. **Clear title and description**
2. **Steps to reproduce the issue**
3. **Expected vs actual behavior**
4. **Environment details**:
   - Node.js version
   - MySQL version
   - Package version
   - Operating system

### Feature Requests

For feature requests, please provide:

1. **Clear description of the feature**
2. **Use case and motivation**
3. **Proposed API (if applicable)**
4. **Examples of how it would be used**

## 📖 Documentation

### API Documentation

- Use JSDoc comments for all public APIs
- Include examples in documentation
- Keep README.md up to date

### Code Comments

- Comment complex logic and algorithms
- Explain "why" not just "what"
- Use clear, concise language

## 🏷️ Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Run full test suite
4. Build and verify package
5. Create git tag
6. Publish to npm
7. Create GitHub release

## 🤝 Code of Conduct

### Our Pledge

We are committed to providing a friendly, safe, and welcoming environment for all contributors, regardless of experience level, gender identity and expression, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, religion, or nationality.

### Our Standards

Examples of behavior that contributes to creating a positive environment include:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

### Unacceptable Behavior

Examples of unacceptable behavior include:

- The use of sexualized language or imagery
- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

## 📞 Getting Help

If you need help or have questions:

1. Check the [documentation](README.md)
2. Search [existing issues](https://github.com/yourusername/querycraft-mysql/issues)
3. Create a new issue with the "question" label
4. Join our community discussions

## 🙏 Recognition

All contributors will be recognized in our README.md file. We appreciate every contribution, no matter how small!

---

Thank you for contributing to QueryCraft MySQL! 🎉