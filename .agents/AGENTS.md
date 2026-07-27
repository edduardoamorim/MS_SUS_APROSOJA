# Security & Privacy Rules

## Confidentiality of Environment Files and API Keys

- **Strict Prohibitions on `.env` Files**:
  - NEVER view, read, open, edit, log, display, print, copy, commit, or transmit any `.env` file or variant (e.g., `.env`, `.env.local`, `.env.development`, `.env.production`, `.env.staging`, `*.env`, `keys.env`).
  - DO NOT use file viewing, reading, or searching tools (`view_file`, `grep_search`, terminal commands, etc.) on `.env` files or paths containing secrets.
  - DO NOT include `.env` contents, secret API keys, tokens, passwords, database URLs, or credentials in any chat responses, code comments, artifacts, scripts, logs, or commitments.
  - If referencing environment variables in code, use generic placeholder names or document variable names without revealing actual secret values.
