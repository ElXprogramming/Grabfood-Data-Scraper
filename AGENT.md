# Agent Security & Operational Guidelines

## 1. Strict GitIgnore & Privacy Compliance
The AI agent must **NEVER** read, open, view, or inspect the contents of any file or directory matched by `.gitignore`.

Specifically forbidden from reading:
- **Environment files**: `.env`, `.env.local`, `.env.development`, `.env.production`, `*.env` (only `.env.example` is allowed).
- **Service Account Keys & Credentials**: `serviceAccountKey.json`, `*serviceAccount*.json`, `*firebase*.json`, `firebase-credentials.json`, or any file inside `credentials/`, `secrets/`, or `private/`.
- **Cryptographic Keys & Certificates**: `*.pem`, `*.key`, `*.cert`, `*.crt`, `*.p12`.

## 2. Safe Command Execution Rules
- **DO NOT** execute commands that dump, display, or grep contents of ignored credential files (e.g. `cat .env`, `tail -n 20 serviceAccountKey.json`, `grep "key" .env`).
- **DO NOT** write or execute ad-hoc scripts that print out secret environment variables or credential JSON values.
- When verifying configuration, only verify file existence (e.g. `test -f serviceAccountKey.json && echo "Found"`) without displaying contents.

## 3. Zero-Knowledge Credential Programming
- The agent writes application code that expects credentials to be supplied via standard environment variables or predefined relative file paths (e.g., `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`, `serviceAccountKey.json`).
- The agent never needs to know or see the real secrets to write, refactor, or test the code.
