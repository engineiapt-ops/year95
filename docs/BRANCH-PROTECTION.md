# Branch protection

The main branch is protected by repository settings. These settings are governance requirements for YEAR95 and must be configured in GitHub.

## Required rules

- Pull requests are required; direct pushes to main are prohibited.
- Required status checks must pass before merge:
  - install
  - typecheck
  - lint
  - architecture
  - unit
  - contract
  - integration
  - build
  - secret-scan
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Require CODEOWNERS review.
- Administrators should be subject to the same pull-request requirements.
- Allow no merge method that bypasses required checks.

## How to configure

In the repository, open Settings, then Branches, then Add branch protection rule for main and enable the rules above.

If the repository UI uses rulesets instead of classic branch protection, create a ruleset targeting main with equivalent pull-request, status-check, and push restrictions.

## Architecture gate proof

The architecture gate is proven with a non-merging test PR:

1. Create a temporary branch from main.
2. Add an import from packages/quant/src/index.ts to a package other than @year95/domain or @year95/contracts.
3. Open a PR against main.
4. The architecture check must fail with quant-only-domain-contracts.
5. Close the PR without merging and delete the temporary branch.
6. Restore the test file and verify a normal PR is green.

The same procedure applies to the other forbidden layer rules. This is intentionally a disposable negative test; no violating code belongs in main.

## AI Studio workflow

AI Studio may be used for development and automated validation, but it must work on a feature branch. Changes reach main only through a pull request that passes the protected checks.
