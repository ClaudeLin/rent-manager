# Security Policy

## Supported version

Security fixes target the version currently deployed from the `main` branch. Older commits, forks, and local modifications are not supported releases.

## Report a vulnerability privately

Do **not** open a public GitHub Issue for suspected vulnerabilities, credentials, personal data, or abuse techniques.

Email [product.cs@muchengtech.com](mailto:product.cs@muchengtech.com) with:

- the affected URL, route, or commit;
- reproducible steps using test data only;
- the expected and observed behavior;
- the potential impact;
- any suggested mitigation.

Do not include passwords, API keys, government identifiers, payment data, or another person's personal information. If a report requires sensitive evidence, first ask for a secure transfer method and wait for instructions.

## Scope notes

The static question-bank files and public Turnstile Site Key are intentionally public. Cloudflare Worker secrets, private keys, access tokens, and credentials must never be committed. A public email address, domain name, origin allowlist, or Email Service binding name is configuration metadata, not an authentication secret.
