# UpdAPI

> **A living benchmark of how quickly frontier coding agents adapt to real API changes.**

UpdAPI tracks API evolution over time and turns verified, timestamped changes into reproducible evaluation cases for frontier coding models and agents.

The long-term goal is a public **API Freshness Observatory**: an independently reproducible view of how well AI coding systems keep pace with the software ecosystem they are increasingly asked to build.

> **Direction reset — August 2026.** The original UpdAPI index is no longer the product. It is becoming part of the measurement infrastructure.

---

## Why UpdAPI changed direction

UpdAPI was originally created to address a common failure mode in LLM-assisted programming: models frequently relied on outdated API knowledge, producing deprecated methods, invalid endpoints, and code based on old documentation.

That environment has changed substantially.

Modern coding systems are no longer just static language models answering from training data. Frontier agents can search the web, inspect repositories and installed packages, retrieve official documentation, execute code, observe failures, and iteratively repair their implementations at inference time.

A useful signal of this shift came from Cursor in August 2026, when it removed its `@Docs` documentation-indexing feature. Cursor explained that agents had become good enough at locating and reading documentation themselves that maintaining a separate documentation index was no longer necessary.

Source: [Cursor staff explanation, 5 August 2026](https://forum.cursor.com/t/cursor-3-14-2-sunsetting-docs/167423/7)

This changes the interesting question.

The original question was:

> **How do we give an LLM current API documentation?**

UpdAPI now asks:

> **Do frontier coding agents still suffer from stale API knowledge — and if so, how quickly do they adapt when APIs change?**

That is an empirical question, and it should be measured continuously rather than assumed.

---

## What UpdAPI is becoming

UpdAPI has three connected outputs.

### 1. API Evolution Dataset

A timestamped, provenance-rich record of real API and SDK changes:

- newly introduced APIs
- deprecated APIs
- removed APIs
- renamed methods and endpoints
- signature and schema changes
- SDK and major-version migrations
- behavioural changes
- documentation changes
- rate-limit, policy, and other developer-relevant changes

Each accepted change event should be traceable to authoritative evidence and, where practical, include executable before/after fixtures.

### 2. Frontier API Freshness Benchmark

Verified API-change events become evaluation cases for contemporary coding systems.

The benchmark evaluates the workflow developers actually use:

```text
task
  → agent
  → search / retrieval / repository inspection
  → implementation
  → execution
  → diagnosis / recovery
  → verified result
```

The primary object of study is therefore the **coding agent as a system**, not merely a naked model completion.

Controlled variants can still isolate the contribution of individual capabilities, for example:

- model without external retrieval
- agent with its normal tools
- agent with web search disabled
- agent with authoritative current documentation supplied
- agent with a retrieval layer such as MCP/RAG
- agent with execution and repair enabled

This lets us measure whether extra documentation infrastructure still provides meaningful value rather than presuming that it does.

### 3. Public API Freshness Observatory

Results should ultimately be published as a continuously updated, drill-downable benchmark rather than buried in repository artifacts.

A public view could compare systems on metrics such as:

| Metric | Question |
|---|---|
| **Verified task success** | Does the final implementation actually work against the target API/version? |
| **Stale API error rate** | How often does the system use an obsolete interface? |
| **API knowledge lag** | How long after a real API change until the system reliably succeeds? |
| **Recovery rate** | When initially wrong, can the agent diagnose and repair the failure? |
| **Retrieval lift** | How much do web/docs/RAG tools improve verified success? |
| **Reliability** | Does the system succeed repeatedly, not merely once? |
| **Cost / latency** | What does successful recovery cost in time, tokens, and tool calls? |

The headline should remain grounded in verified execution, with secondary metrics explaining *why* systems differ.

---

## The key idea: temporal evaluation

Static API benchmarks decay quickly. Once their cases are old, they become increasingly likely to appear in training data, examples, benchmark-specific optimizations, or model memory.

UpdAPI instead aims to continuously capture **new, timestamped API changes** and turn them into temporal holdouts.

A simplified lifecycle:

```text
OBSERVE
  official changelogs, release notes, SDK releases, specs, docs

VERIFY
  confirm the change against authoritative sources and/or executable behaviour

FREEZE
  store provenance, timestamps, before/after states, fixtures, and expected outcome

EVALUATE
  run the same case across coding systems under defined tool conditions

REPEAT
  rerun over time to measure adoption and reliability

PUBLISH
  leaderboard + per-case evidence + methodology + reproducible artifacts
```

This makes **time-to-adoption** measurable.

Example:

```text
API change published: 2026-08-01

2026-08-01   Agent A: fail   Agent B: fail   Agent C: fail
2026-08-03   Agent A: pass   Agent B: fail   Agent C: fail
2026-08-07   Agent A: pass   Agent B: pass   Agent C: fail
2026-08-12   Agent A: pass   Agent B: pass   Agent C: pass
```

Rather than asking whether a model has memorised an old benchmark, UpdAPI can observe how quickly coding systems absorb or recover from changes occurring in the live software ecosystem.

---

## Benchmark principles

UpdAPI should optimize for measurement quality before leaderboard scale.

### Verify outcomes, not prose

Whenever practical, a benchmark case should end in an executable or otherwise deterministic assertion. "The answer sounds current" is not sufficient evidence.

### Preserve provenance

Every change event should retain:

- canonical API / package identity
- before and after versions
- first observed / published timestamps
- authoritative source URLs
- archived evidence where licensing permits
- change classification
- expected modern usage
- verification method
- benchmark-case version

### Separate discovery from evaluation

The system that discovers a change must not silently decide that its interpretation is ground truth. High-value cases need independent verification or deterministic evidence.

### Measure agents as deployed

A coding agent's web search, repository inspection, terminal, package manager, and repair loop are part of the product developers use. Default-agent evaluation should preserve those capabilities and record them explicitly.

### Include controlled ablations

Agent-native evaluation should be complemented by controlled conditions when they answer a useful causal question, especially whether current documentation, web search, or RAG materially improves outcomes.

### Treat reliability as first-class

One lucky pass should not imply robust freshness. Repeated trials should be used where system nondeterminism can materially affect conclusions.

### Keep benchmark versions immutable

Published results must identify the benchmark version, case set, runner configuration, model/agent version, tool permissions, date, and scoring rules. Methodology changes create a new benchmark version rather than silently rewriting history.

### Defend against contamination

Recent change events are the strongest holdouts. Some evaluation cases may need an embargoed/private evaluation window before their full fixtures are released publicly. Public reproducibility and temporal integrity should both be preserved by releasing cases after their live evaluation window where appropriate.

---

## Initial scope

Start small and high-confidence rather than attempting to monitor every API on the internet.

The first corpus should focus on approximately 10–20 fast-moving, developer-relevant ecosystems with authoritative version/changelog evidence and practical executable verification. Candidate families include:

- major AI model/provider SDKs
- AI application SDKs
- major web frameworks
- cloud/edge developer platforms
- payments
- databases and hosted data platforms
- high-usage npm/PyPI libraries with meaningful API evolution

Selection should be based on measurable change frequency, developer relevance, verifiability, and benchmark diversity—not brand prestige alone.

---

## Change-event data model

The durable asset is not a flat list of documentation URLs. It is a corpus of verified change events.

Illustrative shape:

```json
{
  "id": "vendor.package.2026-08-01.signature-change",
  "ecosystem": "npm",
  "package": "example-sdk",
  "version_before": "3.8.0",
  "version_after": "4.0.0",
  "published_at": "2026-08-01T00:00:00Z",
  "first_observed_at": "2026-08-01T03:14:00Z",
  "change": {
    "type": "signature_change",
    "old": "client.create(name, options)",
    "new": "client.create({ name, ...options })"
  },
  "sources": [
    {
      "type": "official_changelog",
      "url": "https://example.com/changelog"
    }
  ],
  "verification": {
    "kind": "executable_test",
    "fixture": "cases/vendor-package-signature-change/"
  }
}
```

The production schema will be versioned and stricter than this example. See [`docs/BENCHMARK_SPEC.md`](docs/BENCHMARK_SPEC.md).

---

## What happens to the existing UpdAPI index?

It stays useful, but its role changes.

`api-docs-urls.csv`, the URL verifier, alignment repair tooling, scraper experiments, and MCP server are now **legacy/source-acquisition infrastructure**. They can help discover authoritative resources, establish provenance, and study documentation movement over time.

They are no longer the core product thesis.

In particular, UpdAPI should **not** spend substantial effort manually expanding a generic documentation directory merely so an agent can find documentation it could already locate itself.

Existing commands remain useful locally:

```bash
npm install
npm test
npm run check-links
npm run realign
npm run verify-alignment
npm run mcp
```

---

## Execution model

UpdAPI does **not** rely on GitHub Actions for benchmark operation or dataset maintenance.

For now, collection and evaluation runners should be executable locally and in explicitly controlled compute environments. The architecture should remain portable so the same jobs can later be scheduled and supervised by persistent agent infrastructure such as XUXI without changing benchmark semantics.

The benchmark must record the environment in which each run occurred; scheduler choice must never become hidden methodology.

### Running the benchmark tooling (v0)

Everything runs locally; there is no CI dependency.

```bash
npm install
npm run bench:validate     # schemas + dataset cross-reference checks
npm run bench:controls     # prove every case validator REJECTS its known-stale
                           # control and ACCEPTS its known-current control (no LLM involved)
npm test                   # mocha suite, including negative controls that prove
                           # the validator and the harness can themselves fail
npm run bench:evidence -- <package> <version>   # re-derive registry evidence for an event
```

`bench:controls` is BENCHMARK_SPEC section 4.3 made executable: a case whose
validator cannot reject its stale control is refused, because a detector that
cannot fail is not evidence. Fixtures are mutated in place during a control
run and restored byte-identically afterwards.

---

## Roadmap

### Phase 0 — Methodology lock

- define versioned change-event schema
- define benchmark-case schema
- define runner/run-manifest schema
- define evidence and acceptance requirements
- define scoring and repeated-run policy
- define temporal holdout / publication policy
- create a tiny hand-verified gold set

### Phase 1 — First living corpus

- capture 30–50 high-confidence change events across several ecosystems
- create executable fixtures for the strongest cases
- validate event ingestion and provenance
- establish deterministic baseline checks independent of any LLM

### Phase 2 — Agent benchmark

- implement pluggable agent runners
- run at least three materially different frontier coding systems
- record complete run manifests and artifacts
- add default-agent and controlled retrieval conditions
- calculate reliability and time-to-adoption metrics

### Phase 3 — Public observatory

- publish methodology and benchmark versions
- publish model/agent leaderboard
- provide per-case drill-down with evidence
- expose downloadable result data
- chart API freshness longitudinally
- rerun new frontier systems and new API-change cohorts continuously

### Phase 4 — Longitudinal research asset

- study API-change characteristics and documentation evolution over time
- quantify which classes of changes cause the most agent failures
- measure how agent tooling changes knowledge lag
- publish reproducible analyses and benchmark reports

---

## What UpdAPI is *not*

UpdAPI is not trying to become:

- another generic API directory
- another documentation search engine
- another RAG wrapper over public docs
- another MCP directory
- a benchmark designed to prove that UpdAPI itself improves scores

The benchmark should remain useful even if its eventual conclusion is that frontier coding agents have almost completely solved stale API knowledge.

That result would itself be valuable.

---

## Related work and signals

The problem is active, and UpdAPI should explicitly build on rather than ignore prior work.

- Cursor's removal of `@Docs` is a concrete product signal that general-purpose agents are increasingly capable of finding their own documentation: [Cursor Community Forum](https://forum.cursor.com/t/cursor-3-14-2-sunsetting-docs/167423/7)
- SotaDocs publishes a benchmark focused on API correctness/freshness and documentation assistance: [SotaDocs Benchmarks](https://sotadocs.com/benchmarks/)
- Academic work on API evolution, deprecated API use, and temporal coding evaluation should be tracked in the benchmark methodology and related-work notes as the corpus matures.

UpdAPI's intended differentiation is a **continuously refreshed, timestamped, independently reproducible benchmark built from real API evolution and evaluated on full coding-agent systems**.

---

## Contributing

The highest-value contributions are no longer bulk additions of API names.

Useful contributions include:

- verified recent API change events
- authoritative provenance sources
- executable before/after fixtures
- deterministic validators
- agent-runner adapters
- benchmark methodology review
- contamination and leakage analysis
- reproducibility improvements
- public visualization and result exploration

A small number of excellent cases is more valuable than thousands of weakly verified rows.

---

## License

This repository is licensed under the [Apache License 2.0](LICENSE).
