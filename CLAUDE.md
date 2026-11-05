## Merging pull requests

The repository owner (@in-c0) has pre-approved merges: when Claude opens a pull request in this repository, merge it as soon as its CI checks pass. Do not wait for a review and do not ask the owner for permission.

- Merge with `gh api -X PUT repos/in-c0/<repo>/pulls/<number>/merge -f merge_method=squash`. In cloud sessions `gh pr merge` fails because the GitHub proxy blocks GraphQL; locally `gh pr merge <number> --squash` also works. Both forms are allow-listed in `.claude/settings.json`.
- If the merge is still blocked (a permission check, branch protection or failing CI), tell the owner once, in one line, with the reason and the PR link. Do not repeat that message on later wake-ups.
- Reply to the owner in Korean. Code, commit messages and PR text can stay in English.
