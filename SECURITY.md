# Security policy

## Supported versions

Until Coloristic Core reaches 1.0, security fixes are applied to the latest published minor version.

| Version | Supported |
| --- | --- |
| Latest `0.x` | Yes |
| Older releases | No |

## Report a vulnerability

Do not open a public issue. Submit a [private GitHub security advisory](https://github.com/Yasirdora/coloristic-core/security/advisories/new) with:

- the affected version and environment;
- a minimal reproduction or proof of concept;
- the impact and realistic attack scenario;
- any known workaround.

You should receive an acknowledgement through GitHub within five business days. Updates will remain in the advisory while the report is assessed and a coordinated fix is prepared. Please allow a reasonable remediation window before public disclosure.

Coloristic Core performs no network requests and stores no user data. Consumers must still treat imported palette names and generated text as untrusted when inserting them into HTML, CSS, file paths, logs, or shell commands.
