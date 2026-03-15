# Application Architecture Context

## Database Layer
- **Technology:** NoSQL (Inferred via LintBase)
- **Validation:** LintBase monitors schema drift and field type consistency.

## Agent Instructions
- Always review `collections.md` before writing any database queries or mutations.
- Do not assume implicit fields exists. Check presence rates.
- For schema changes, consider the current drift levels reported in `risk-report.md`.