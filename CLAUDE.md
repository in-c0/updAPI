# updAPI

<!-- trusted-infra:v1 -->
## Trusted infrastructure and standing authorization

Read by Claude and by the Claude Code auto mode classifier. These are the owner's own statements.

- Owner: Ji (GitHub @in-c0) solely owns the in-c0 GitHub org and every repo in it, the single Cloudflare account and the single Stripe account. Visibility differs per repo: confidential material goes only to private repos.
- Source control: github.com/in-c0 and every repo under it are trusted. Pushing to any branch including main, opening PRs and merging them right away are routine and pre-approved by the owner.
- Deploy targets: the owner's Cloudflare Pages and Workers (Git integration on push to main, `wrangler deploy`, `wrangler pages deploy`), the owner's Netlify and Vercel projects (Git integration), Hugging Face Spaces under the owner's account, and GitHub Pages for in-c0 repos. Production deploys of in-c0 products to these targets carry the owner's standing authorization; every deploy can be rolled back from the host's deployment history.
- Trusted domains: `*.pages.dev`, `*.workers.dev`, `*.netlify.app`, `*.vercel.app` and the in-c0 product domains listed in Project-harness `INFRA.md`.
- Still not authorized: force pushes, deleting branches, tags or releases, committing secrets or sending them outside in-c0, purchases, and messaging people outside in-c0.
<!-- /trusted-infra:v1 -->
Reply to the owner in Korean. Code, commit messages and PR text stay in English.
