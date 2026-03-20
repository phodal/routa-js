# Routa

**Guardrails Embedded in the Change Lifecycle**

`routa-fitness` is the Python package behind Routa's fitness orchestration.
It is built to keep verification close to the lifecycle of a change, not only at the tail end of CI.

This package currently powers three kinds of decisions:

- should the change pass baseline quality gates?
- how much confidence do we have in the current change?
- should a human reviewer be pulled in because the change is risky?

## Lifecycle View

```text
The further to the right, the higher the fix cost,
the lower the certainty of automation,
and the more human judgment is required.

[Requirements / AI-generated change]
        |
        v
[Rule Definition] -> [Baseline Quality Gates] -> [Risk Identification & Routing] -> [Deep Validation] -> [Release & Feedback]
     |                      |                           |                             |                        |
     |                      |                           |                             |                        |
     |- metrics?            |- compile?                |- API/schema?                |- API parity?          |- merge / release
     |- thresholds?         |- lint?                   |- impact radius?             |- E2E / visual?        |- update rules
     |- hard gates?         |- tests?                  |- suspicious expansion?      |- semgrep / audit?     |- tune thresholds
     |- evidence?           |- coverage?               |- missing evidence?          |- need human review?   |- close the loop
```

Possible outcomes:

- `PASS`: continue to review, merge, and release
- `WARN`: strengthen evidence or escalate review depth
- `BLOCK`: do not merge

System foundation:

```text
docs/fitness  ->  routa-fitness orchestration  ->  hard gates + weighted score + review triggers
```

Feedback loop:

```text
production issue / missed detection
    -> update docs/fitness
    -> refine thresholds
    -> add stronger verification templates
```

## What It Does

Today the package provides:

- architecture fitness checks grouped by dimension
- fast / normal / deep execution tiers
- change-aware execution against the current git diff
- hard-gate and weighted-score orchestration
- `review-trigger` rules that ask for human review on risky changes

It is useful both as:

- a repository-local fitness runner for Routa
- the beginning of a more reusable fitness engine

## Installation

### Install from PyPI with `uv`

```bash
uv tool install routa-fitness
```

Run without installing globally:

```bash
uvx routa-fitness --help
uvx routa-fitness run --tier fast
uvx routa-fitness review-trigger --base HEAD~1
```

### Install from PyPI with `pip`

```bash
pip install routa-fitness
```

### Run in a project without global install

```bash
uvx --from routa-fitness routa-fitness --help
uvx --from routa-fitness routa-fitness run --tier fast
```

### Develop the package itself from source

If you are working on the `routa-fitness` package source, clone the Routa repository first and install from the package directory or from the repository root with an explicit relative path.

From the repository root:

```bash
git clone https://github.com/phodal/routa.git
cd routa
uv pip install -e ./tools/routa-fitness
```

From the package directory:

```bash
git clone https://github.com/phodal/routa.git
cd routa/tools/routa-fitness
uv pip install -e .
```

With `pip`:

```bash
git clone https://github.com/phodal/routa.git
cd routa
pip install -e tools/routa-fitness
```

## Quick Start

### 1. Create a fitness spec

By default, `routa-fitness run` looks for specs under the current project's:

```text
docs/fitness/*.md
```

Example `docs/fitness/code-quality.md`:

```yaml
---
dimension: code_quality
weight: 20
threshold:
  pass: 90
  warn: 80
metrics:
  - name: lint
    command: npm run lint 2>&1
    hard_gate: true
    tier: fast
    description: ESLint must pass

  - name: unit_tests
    command: npm run test:run 2>&1
    pattern: "Tests\\s+\\d+\\s+passed"
    hard_gate: true
    tier: normal
    description: unit tests must pass
---

# Code Quality

Narrative evidence, rules, and ownership notes can live below the frontmatter.
```

### 2. Run the checks

```bash
routa-fitness run --tier fast
routa-fitness run --tier normal
routa-fitness run --changed-only --base HEAD~1
routa-fitness validate
```

### 3. Add review triggers

By default, `review-trigger` loads the current project's:

```text
docs/fitness/review-triggers.yaml
```

Example `docs/fitness/review-triggers.yaml`:

```yaml
review_triggers:
  - name: high_risk_directory_change
    type: changed_paths
    paths:
      - src/core/acp/**
      - src/core/orchestration/**
      - crates/routa-server/src/api/**
    severity: high
    action: require_human_review

  - name: oversized_change
    type: diff_size
    max_files: 12
    max_added_lines: 600
    max_deleted_lines: 400
    severity: medium
    action: require_human_review
```

Run it:

```bash
routa-fitness review-trigger --base HEAD~1
routa-fitness review-trigger --base HEAD~1 --json
```

Example output:

```json
{
  "human_review_required": true,
  "base": "HEAD~1",
  "changed_files": [
    "crates/routa-server/src/api/acp_routes.rs"
  ],
  "diff_stats": {
    "file_count": 13,
    "added_lines": 936,
    "deleted_lines": 20
  },
  "triggers": [
    {
      "name": "high_risk_directory_change",
      "severity": "high",
      "action": "require_human_review",
      "reasons": [
        "changed path: crates/routa-server/src/api/acp_routes.rs"
      ]
    }
  ]
}
```

## Commands

### `routa-fitness run`

Runs dimension-based fitness checks loaded from `docs/fitness/*.md`.

Common flags:

```bash
routa-fitness run --tier fast
routa-fitness run --parallel
routa-fitness run --dry-run
routa-fitness run --verbose
routa-fitness run --changed-only --base HEAD~1
```

### `routa-fitness validate`

Checks that dimension weights sum to `100%`.

```bash
routa-fitness validate
```

### `routa-fitness review-trigger`

Evaluates governance-oriented trigger rules for risky changes.

Common flags:

```bash
routa-fitness review-trigger --base HEAD~1
routa-fitness review-trigger --json
routa-fitness review-trigger --fail-on-trigger
routa-fitness review-trigger --config docs/fitness/review-triggers.yaml
```

### `routa-fitness graph ...`

Graph-backed commands support impact analysis, test radius, and AI-friendly review context.

Examples:

```bash
routa-fitness graph impact --base HEAD~1
routa-fitness graph test-radius --base HEAD~1
routa-fitness graph review-context --base HEAD~1 --json
```

## AI-Friendly Authoring Notes

If an AI agent is generating or updating fitness specs, these conventions work best:

- keep one dimension per file
- make the frontmatter executable and the body explanatory
- prefer stable command outputs over fragile text matching
- use `hard_gate: true` only when failure should really block progress
- keep review-trigger rules separate from scoring metrics
- treat markdown as the narrative layer, not the only source of structure

Recommended file layout:

```text
your-project/
  docs/
    fitness/
      README.md
      code-quality.md
      security.md
      review-triggers.yaml
```

Minimal bootstrap flow for a new repository:

```bash
mkdir -p docs/fitness
cat > docs/fitness/code-quality.md <<'EOF'
---
dimension: code_quality
weight: 100
threshold:
  pass: 100
  warn: 80
metrics:
  - name: lint
    command: npm run lint 2>&1
    hard_gate: true
    tier: fast
---

# Code Quality
EOF

routa-fitness validate
routa-fitness run --tier fast
```

## Python API

### Review trigger example

```python
from pathlib import Path

from routa_fitness.review_trigger import (
    collect_changed_files,
    collect_diff_stats,
    evaluate_review_triggers,
    load_review_triggers,
)

repo_root = Path(".").resolve()
rules = load_review_triggers(repo_root / "docs" / "fitness" / "review-triggers.yaml")
changed_files = collect_changed_files(repo_root, "HEAD~1")
diff_stats = collect_diff_stats(repo_root, "HEAD~1")
report = evaluate_review_triggers(rules, changed_files, diff_stats, base="HEAD~1")
print(report.to_dict())
```

### Fitness spec loading example

```python
from pathlib import Path

from routa_fitness.evidence import load_dimensions

dimensions = load_dimensions(Path("docs/fitness"))
for dimension in dimensions:
    print(dimension.name, len(dimension.metrics))
```

## Recommended Hook Integration

For local repositories, a practical pattern is:

- `pre-commit`: run quick lint only
- `pre-push`: run full checks, then print review-trigger warnings
- CI: run `routa-fitness run` and publish JSON/report output

That lets automation catch deterministic failures early while still escalating ambiguous risky changes to humans.

## Known Constraints

Current constraints to be aware of:

- the package name on PyPI is `routa-fitness`
- the default authoring format is still markdown frontmatter under `docs/fitness`
- the project is evolving toward a cleaner core / adapter / preset split
- graph commands require the optional graph dependency set

## Status

Current status:

- stable for Routa-internal usage
- installable as a standalone PyPI package
- suitable for AI-assisted project configuration
- evolving toward a reusable fitness engine architecture
