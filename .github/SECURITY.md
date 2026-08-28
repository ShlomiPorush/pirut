# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub's private vulnerability reporting on the
[Security tab](https://github.com/ShlomiPorush/pirut/security/advisories/new). Do not open a public
issue for a security problem.

Please include what you observed, how to reproduce it, and the impact you believe it has. Expect an
initial response within a week.

## Never include real data in a report

Pirut processes credit card statements. A vulnerability report must never contain a real statement,
real transaction data, an account or card number, or any credential. Redact or synthesize anything
you attach. A report containing real financial data will be deleted rather than triaged.

## Scope

Pirut is single-user software that runs locally and binds to loopback. It has no authentication,
which is a deliberate and documented consequence of that boundary rather than a vulnerability.

In scope:

- Anything that lets the application be reached beyond loopback without an explicit configuration change.
- Anything that sends financial data, file contents, merchant names, or telemetry outside the local runtime.
- Data exposure through logs, error messages, backups, or container images.
- Handling of an untrusted uploaded file that leads to code execution, path traversal, or resource exhaustion.
- Dependency or container issues that are exploitable in the way Pirut actually uses them.

Out of scope:

- The absence of authentication in the documented loopback-only configuration.
- Consequences of deliberately exposing the application to a network, which is not supported.
- Vulnerabilities that require prior administrative access to the host.

## Supported versions

The project is pre-release. Only the current `main` branch receives fixes.
