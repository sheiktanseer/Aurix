# Git hygiene (binding practice)

This environment **auto-commits the working tree on a timer** to whatever branch
is checked out, with a generic message ("Another commit"), and those commits are
pushed to `origin`. Treat `origin` (sheiktanseer/Aurix.git) as **public** for
secret-handling purposes regardless of its actual visibility.

Two consequences drive the rules below:

1. **Untracked ≠ safe.** An untracked file is one timer-tick from being
   committed. There is no "parked until later" state. Either commit a file with
   an intentional message now, or ensure `.gitignore` excludes it.
2. **A secret in the tree leaks.** A dev signing key, `.env`, `.pem`, or `.key`
   will be committed and pushed before you can react. Prevention is the only
   control.

## Rules

- **Secrets never touch the tree unignored.** `.gitignore` excludes `.env*`,
  `*.pem`, `*.key`, `*.p8/p12/pfx`, `*.jwk`, `keys/`, `secrets/`. Generate dev
  keys only into ignored paths. The gitleaks CI job and the `hooks/pre-push`
  hook are the backstop, not the primary control.
- **Install the hooks:** `git config core.hooksPath hooks`.
- **Fold robot noise before pushing a feature branch.** Before pushing, squash
  the interleaved "Another commit" commits into your intentional commits
  (`git rebase -i <base>` locally, or `git reset --soft <base>` then re-commit).
  History need not be forensic-clean everywhere, but each pushed feature branch
  should read as deliberate.
- **The signing branch (Step 6) is held to a higher bar.** Open
  `phase-2/signing` fresh from a clean base, keep it free of robot commits
  (rebase clean before opening the PR), and never let key material enter it. A
  cryptographic reviewer reading a diff interleaved with robot commits will —
  correctly — trust the whole artifact less.

## If a secret is ever committed

Rotate the key immediately (assume it is compromised), then scrub history
(`git filter-repo`) and force-push. Rotation first — scrubbing a pushed secret
does not un-leak it.
