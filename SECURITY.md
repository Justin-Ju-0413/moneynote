# Security Policy

MoneyNote is a local-first personal-finance application. Financial records and API keys are sensitive even when the application has no hosted backend.

## Supported versions

Security fixes target the latest release and the current `main` branch. Users should upgrade to the newest release before reporting a problem that may already be fixed.

## Security boundaries

- Records are stored in browser IndexedDB.
- API keys are encrypted locally with AES-GCM, but a compromised device, browser profile or malicious extension can still access application data.
- Online AI features send a minimized and redacted request to the provider selected by the user. That provider's privacy and retention policy still applies.
- Exports and backups contain financial data. Store them outside public repositories and shared folders.

## Reporting a vulnerability

Do not include API keys, financial records, personal identifiers or exploit details in a public Issue.

Open a minimal Issue stating that you need a private security-reporting channel, without sensitive details. The maintainer will arrange a private follow-up. Include the affected version, platform and a safe reproduction summary only after a private channel is established.

## Out of scope

- Recovery of data deleted by the browser or operating system when no export exists.
- Security guarantees on rooted, jailbroken or already-compromised devices.
- Availability, retention or billing behavior of third-party AI providers.
