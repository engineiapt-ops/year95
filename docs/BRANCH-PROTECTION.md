# Main-branch governance and protection

## Verified status (2026-10-13)

**The `main` branch is not protected by GitHub settings.** The repository is private and on GitHub Free. The connected GitHub integration cannot read or write the branch-protection endpoint (HTTP 403), and the repository rulesets API reports that a supported plan is required for a private repository.

The rules below are the intended governance policy, not a statement that GitHub currently enforces it. Do not make the repository public to obtain protection. Native enforcement requires a plan that supports protection for private repositories and an authorized settings session/connection.

## Required native rules when available

Configure a branch protection rule or ruleset targeting `main` with:

- Require pull requests; prohibit direct pushes and force pushes; prevent branch deletion.
- Require the checks `install`, `typecheck`, `lint`, `architecture`, `unit`, `contract`, `integration`, `build`, and `secret-scan`.
- Require branches to be up to date and conversations to be resolved.
- Apply the rules to administrators and disable bypass where supported.
- Do not require CODEOWNERS approval while `CODEOWNERS` has only the repository owner; self-approval is not a valid independent review. Add an approval requirement only when a separate eligible reviewer exists.
- Do not make the API Docker workflow globally required: it runs only for API-related paths. Review its result when that workflow is triggered.

After configuring the settings, read them back through an authorized GitHub API/session and perform a negative test showing that a deliberately failing check cannot be merged. Only then may the repository be described as protected.

## Interim manual release gate while on GitHub Free

This is a compensating process only. **It does not technically prevent a direct push or make `main` protected.**

For every change:

1. Work on one feature branch and one PR at a time. Do not intentionally commit or push directly to `main`.
2. Review the complete diff against the current `main`; verify the PR contains only its stated scope and no secrets, destructive database changes, live-trading capability, or forbidden layer dependencies.
3. Wait for the latest CI run to finish on the exact PR head SHA. Require all nine checks above to pass. If API-related paths changed, also require the API Docker build to pass. Any new commit invalidates the previous head's results; re-check the new SHA.
4. Review all comments and inline review threads. Resolve each issue or document why it does not require a code change.
5. Use squash merge only after the preceding gates are green. Do not merge while any required run is pending, failed, cancelled, or for an older SHA.
6. After merge, verify the PR is merged, confirm `main` points to the resulting merge commit, and verify post-merge CI. Verify API Docker too when it is triggered by the changed paths.

If a direct push or unexpected change to `main` is discovered, stop the next PR and inspect the history and diff before proceeding. Do not claim this process is equivalent to native protection.

## Architecture gate proof

The architecture gate should be tested with a non-merging temporary PR:

1. Create a temporary branch from `main`.
2. Add an import from `packages/quant/src/index.ts` to a package other than `@year95/domain` or `@year95/contracts`.
3. Open a PR against `main`.
4. Confirm the architecture check fails with `quant-only-domain-contracts`.
5. Close the test PR without merging and delete the temporary branch.
6. Verify an ordinary PR remains green.

No violating code may be merged to `main`.

## AI Studio and other coding agents

Coding agents may be used for development and validation, but must work on feature branches and open PRs. The manual release gate above remains necessary until native branch protection is enabled.
