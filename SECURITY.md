# Security Policy

## Supported versions

The most recent release (the `main` branch and the latest version published to
npm) receives security updates.

## Reporting a vulnerability

**Please do not open public issues for security vulnerabilities.**

Report them privately using GitHub's **"Report a vulnerability"** feature on this
repository (the **Security** tab → *Report a vulnerability*). This opens a private
security advisory visible only to the maintainers.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- The affected version
- Any suggested remediation, if known

You can expect an initial response within a few days.

## Handling of credentials

This plugin connects to a SonarQube server using credentials **you** provide via
environment variables (`SONAR_HOST_URL`, `SONAR_USER`, `SONAR_PASSWORD`).

- Credentials are only ever sent to the SonarQube server you configure.
- Authentication headers and tokens are **never** written to logs (the scanner
  token is masked in debug output).
- A project-scoped token is stored locally in `.sonarqube/project.json`.

The `.sonarqube/` directory is git-ignored by the installer. **Never commit it** —
it contains an authentication token.
