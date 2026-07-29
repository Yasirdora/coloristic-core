# Contributing to Coloristic Core

Thank you for helping improve Coloristic Core. Bug reports, focused feature proposals, documentation fixes, and tested pull requests are welcome.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before opening a change

- Search existing issues and pull requests.
- Open an issue before large API changes or new export formats.
- Use a [private security advisory](https://github.com/Yasirdora/coloristic-core/security/advisories/new) for vulnerabilities.
- Keep changes focused; unrelated refactors make color-math review harder.

## Local development

Requires Node.js 20 or newer.

```sh
npm ci
npm run test:watch
```

Before opening a pull request, run the complete release gate:

```sh
npm run check
```

This checks formatting, lint rules, types, tests and coverage, ESM/CommonJS builds, packed runtime
and TypeScript consumers, and the installed package license.

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Run Biome lint rules |
| `npm run format` | Apply repository formatting |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm test` | Run the test suite once |
| `npm run test:coverage` | Enforce coverage thresholds |
| `npm run build` | Create ESM, CommonJS, and declarations |
| `npm run package:smoke` | Pack and verify runtime, declarations, and license contents |

## Engineering principles

- Keep the core independent of UI frameworks, browser globals, storage, and network access.
- Prefer deterministic output and explicit validation errors.
- Never silently composite, coerce, or replace an invalid color.
- Add tests for every public behavior, boundary, and regression.
- Cite a public specification or established reference when changing color or accessibility behavior.
- Describe output as accessibility-aware; never claim that a generated palette guarantees universal accessibility or legal compliance.
- Preserve the paired WCAG guarantee for every documented `on*`/base role combination.

## Public API and TSDoc

Every new or changed public export must include TSDoc that:

- begins with a concise behavior summary;
- documents parameters, return values, defaults, constraints, and thrown `ColoristicError` codes;
- includes `@example` for behavior that is not obvious from the signature;
- explains accessibility scope and contrast guarantees without compliance claims;
- calls out breaking behavior or runtime-specific return types;
- avoids repeating TypeScript types without adding useful meaning.

Update `README.md`, `CHANGELOG.md`, exported types, and examples in the same pull request when the
public contract changes.

## Tests

Prefer behavioral tests over implementation details. Include exact boundary cases for palette size, non-opaque color rejection, role contrast targets, malformed input, and exporter output. Deterministic fixtures should use stable explicit inputs.

## Maintainer release setup

The automated publisher uses npm trusted publishing and intentionally has no long-lived npm token. Before enabling releases:

1. Confirm that the maintainer's npm account has write access to the `@coloristic.org` scope.
2. Create a protected GitHub environment named `npm` in `Yasirdora/coloristic-core` and restrict it to release tags or require approval.
3. Because npm requires a package to exist before a trusted publisher can be attached, publish the first version manually with two-factor authentication, then create the trusted-publisher binding before any later release.
4. In the `@coloristic.org/core` npm package settings, bind GitHub user `yasirdora`, repository `coloristic-core`, workflow filename `release.yml`, environment `npm`, and the `npm publish` permission.
5. Confirm that the repository is public if provenance is required, and remove obsolete automation tokens after the OIDC publisher succeeds.

For the manually published bootstrap version, push its exact commit and tag but do not create a GitHub Release that would ask the automated workflow to republish the same npm version. Start GitHub Release automation with the next version.

For every release, update the version in both package manifests, add the dated changelog section
and comparison links, and run `npm run release:verify -- vX.Y.Z`. Release tags must use the exact
canonical `vX.Y.Z` form.

See npm's [trusted publishing guide](https://docs.npmjs.com/trusted-publishers/) and GitHub's [deployment environment documentation](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments) for the current provider-side setup.

Do not lower coverage thresholds to make a change pass. If genuinely unreachable platform code affects coverage, explain it in the pull request.

## Commits and pull requests

Use clear, imperative subjects. Conventional Commit-style prefixes are encouraged, for example:

- `feat: add Style Dictionary exporter`
- `fix: preserve achromatic OKLCH hues`
- `docs: clarify paired contrast guarantee`

Complete the pull-request template, include tests, note any breaking changes, and update the changelog when the change is user-visible. Maintainers may ask for a smaller issue or follow-up pull request to keep review focused.
