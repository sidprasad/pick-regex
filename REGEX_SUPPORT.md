# Regex Pattern Support

This document describes which regular expression patterns are supported by the PICK Regex Builder's automata analysis engine.

## Overview

PICK uses [`@gruhn/regex-utils`](https://github.com/gruhn/regex-utils) for automata-based regex analysis, which enables:
- Semantic equivalence checking
- Set operations (intersection, complement, difference)
- Example generation

However, not all JavaScript regex features are supported by automata analysis.

## Fully Supported Patterns

These patterns work seamlessly with automata analysis:

- **Quantifiers**: `*`, `+`, `?`, `{m}`, `{m,n}`
- **Character classes**: `[abc]`, `[a-z]`, `[0-9]`, `[^abc]`
- **Escape sequences**: `\w`, `\W`, `\d`, `\D`, `\s`, `\S`, `\t`, `\n`
- **Groups**: `(...)`, `(?:...)`
- **Alternation**: `a|b|c`
- **Anchors**: `^`, `$`
- **Lookahead assertions**: `(?=...)`, `(?!...)`

## Unsupported Patterns (Use with Caution)

These patterns are valid JavaScript regex but **cannot be analyzed** by the automata engine. When detected, PICK automatically falls back to sampling-based equivalence checking:

### Word Boundaries: `\b`, `\B`

Word boundaries are not supported by automata analysis.

**Instead of:**
```regex
\bword\b
```

**Use:**
```regex
^[a-zA-Z0-9_]+$   (for matching whole words)
```

### Lookbehind Assertions: `(?<=...)`, `(?<!...)`

Lookbehind assertions are not supported.

**Instead of:**
```regex
(?<=@)\w+
```

**Use:**
```regex
@\w+   (and extract the part after @)
```

### Backreferences: `\1`, `\2`, etc.

Backreferences make regex non-regular and cannot be analyzed.

**Instead of:**
```regex
(a+)\1
```

**Use:** Consider restructuring your pattern or using multiple regexes.

## Fallback Behavior

When unsupported patterns are detected:

1. **Detection**: The system logs a warning about unsupported features
2. **Fallback**: Automata analysis is skipped, and the system uses sampling-based equivalence checking
3. **Impact**: Analysis may be slower and less precise, but functionally correct

## Best Practices

1. **Prefer supported patterns** for faster, more reliable analysis
2. **Use explicit character classes** instead of `\b` word boundaries
3. **Avoid backreferences** which make regex non-regular
4. **Keep patterns simple** when possible

## Example Transformations

| Unsupported | Supported Alternative |
|-------------|----------------------|
| `\btest\b` | `^test$` (for exact match) or `[^a-zA-Z0-9_]test[^a-zA-Z0-9_]` |
| `(?<=@)\w+` | `@\w+` (with post-processing) |
| `(a)\1` | `aa` (if pattern is known) |

## Technical Details

The automata engine supports classical regular expressions that can be converted to finite automata. Features that require:
- Context-dependent matching (word boundaries)
- Backward references (backreferences)  
- Reverse scanning (lookbehind)

...cannot be represented as finite automata and require sampling-based analysis.
