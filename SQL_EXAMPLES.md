# SQL Pattern Examples

## Example 1: Email Pattern
**Description**: "Emails ending with @company.com"
**Generated SQL Patterns**:
- `%@company.com` (most specific)
- `%@%.com` (more general)
- `%@%` (most general)

## Example 2: User ID Pattern
**Description**: "User IDs starting with 'admin'"
**Generated SQL Patterns**:
- `admin%` (any characters after admin)
- `admin___` (exactly 3 characters after admin)
- `admin%user%` (contains admin and user)

## Example 3: Product Code Pattern
**Description**: "Product codes with format: 2 letters, 3 digits"
**Generated SQL Patterns**:
- `__%%%` (2 any chars, then anything)
- `_____` (exactly 5 characters)

## How to Use

1. Open VS Code settings (Ctrl+,)
2. Search for "pick.targetLanguage"
3. Change from "javascript" to "sql"
4. Open the PICK extension panel
5. Enter your natural language description
6. The LLM will generate SQL LIKE patterns instead of regexes
7. Use the interactive voting process to refine the pattern

## SQL Pattern Syntax

- `%` - Matches any sequence of characters (including empty)
- `_` - Matches exactly one character

### Examples:
- `abc%` matches: "abc", "abcd", "abcdef", "abc123"
- `%xyz` matches: "xyz", "axyz", "123xyz"
- `a_c` matches: "abc", "aXc", "a1c" but not "ac" or "abbc"
- `%test%` matches any string containing "test"
