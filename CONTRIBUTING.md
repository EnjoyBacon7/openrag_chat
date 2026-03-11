# Contributing to OpenRAG Chat

Thank you for your interest in contributing to OpenRAG Chat! We welcome contributions of all kinds — bug reports, features, documentation, and code.

## Code of Conduct

Be respectful, inclusive, and constructive. We aim to maintain a welcoming community for everyone.

## Reporting Issues

### Bug Reports

When reporting a bug, please include:
- A clear, descriptive title
- Steps to reproduce the issue
- Expected behavior vs. actual behavior
- Environment details (OS, Go version, Node version)
- Screenshots or logs if relevant

**Use the Bug Report issue template** when available.

### Feature Requests

For feature suggestions:
- Describe the use case and why it would be valuable
- Include examples or mockups if helpful
- Check existing issues to avoid duplicates

**Use the Feature Request issue template** when available.

## Pull Request Process

### Before You Start

1. **Check for existing issues** — Comment on an existing issue rather than creating duplicates
2. **Fork the repository** and create a branch from `main`
3. **Create a descriptive branch name**:
   - `fix/issue-description` for bug fixes
   - `feat/feature-name` for features
   - `docs/doc-topic` for documentation
   - `refactor/component-name` for refactoring

### Development Workflow

1. **Set up your local environment**:
```bash
git clone https://github.com/YOUR_USERNAME/openrag_chat.git
cd openrag_chat
npm install
```

2. **Make your changes**:
   - Keep commits atomic and descriptive
   - Follow the code style guide (see below)
   - Include tests for new functionality

3. **Test your changes**:
```bash
# Frontend
cd frontend
npm run build

# Backend
cd backend
go build ./...
```

4. **Run the full application**:
```bash
npm run dev
```

### Commit Messages

Write clear, descriptive commit messages:
- Use the imperative mood: "add feature" not "added feature"
- Keep the first line to 50 characters
- Reference issues: "fix #123" or "closes #456"

**Example:**
```
feat: add MCP server reachability diagnostics

- Implement health check endpoint GET /api/health
- Add diagnostic notifications for unreachable servers
- Show actionable "Open Settings" links in notifications

Closes #42
```

### Code Style

**Go:**
- Run `gofmt` on your code
- Use `goimports` for import management
- Follow [Effective Go](https://golang.org/doc/effective_go) conventions
- Write tests for new functions

**TypeScript/React:**
- ESLint configuration is enforced (included in build)
- TypeScript strict mode is required
- Use functional components with hooks
- Keep components small and focused
- Export named exports for testability

**General:**
- Write meaningful comments for complex logic
- Avoid hardcoding configuration; use environment variables
- Keep functions pure when possible
- Use descriptive variable and function names

### Pull Request Template

When submitting a PR, include:

```markdown
## Description
Brief explanation of what this PR does.

## Related Issues
Closes #123

## Testing
How did you test this change? Include steps to reproduce if it's a fix.

## Screenshots (if applicable)
Attach images for UI changes.

## Checklist
- [ ] Code follows the style guidelines
- [ ] Tests have been added/updated
- [ ] Documentation has been updated
- [ ] No new warnings are generated
- [ ] I have tested this locally
```

### Review Process

- Maintainers will review your PR as soon as possible
- You may be asked for changes — this is normal and helpful
- Discussions happen in PR comments
- Once approved, maintainers will merge your PR

## Documentation

Documentation is as important as code. If you:
- Add a new feature → update the README
- Change an API endpoint → update API docs
- Add environment variables → update `.env.example`
- Fix a bug → consider adding to CHANGELOG (if one exists)

## Getting Help

- **Questions about the codebase?** Open a Discussion or comment on an issue
- **Need clarification?** Ask in the PR review
- **Want to discuss a big change?** Open a Discussion first before coding

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).

---

**Thanks for contributing to OpenRAG Chat!** 🎉
