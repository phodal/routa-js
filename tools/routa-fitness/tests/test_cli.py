"""Tests for routa_fitness.cli."""

from routa_fitness.cli import _domains_from_files, _metric_domains, build_parser
from routa_fitness.model import Metric


def test_parser_run_defaults():
    parser = build_parser()
    args = parser.parse_args(["run"])
    assert args.command == "run"
    assert args.tier is None
    assert args.parallel is False
    assert args.dry_run is False
    assert args.verbose is False
    assert args.changed_only is False
    assert args.base == "HEAD"


def test_parser_run_all_flags():
    parser = build_parser()
    args = parser.parse_args(
        ["run", "--tier", "fast", "--parallel", "--dry-run", "--verbose", "--changed-only", "--base", "HEAD~2"]
    )
    assert args.tier == "fast"
    assert args.parallel is True
    assert args.dry_run is True
    assert args.verbose is True
    assert args.changed_only is True
    assert args.base == "HEAD~2"


def test_parser_validate():
    parser = build_parser()
    args = parser.parse_args(["validate"])
    assert args.command == "validate"


def test_parser_review_trigger_defaults():
    parser = build_parser()
    args = parser.parse_args(["review-trigger"])
    assert args.command == "review-trigger"
    assert args.base == "HEAD~1"
    assert args.config is None
    assert args.fail_on_trigger is False
    assert args.json is False
    assert args.files == []


def test_parser_review_trigger_flags():
    parser = build_parser()
    args = parser.parse_args(
        [
            "review-trigger",
            "--base",
            "main",
            "--config",
            "docs/fitness/review-triggers.yaml",
            "--fail-on-trigger",
            "--json",
            "src/core/acp/foo.ts",
        ]
    )
    assert args.command == "review-trigger"
    assert args.base == "main"
    assert args.config == "docs/fitness/review-triggers.yaml"
    assert args.fail_on_trigger is True
    assert args.json is True
    assert args.files == ["src/core/acp/foo.ts"]


def test_parser_graph_impact_defaults():
    parser = build_parser()
    args = parser.parse_args(["graph", "impact"])
    assert args.command == "graph"
    assert args.graph_command == "impact"
    assert args.base == "HEAD"
    assert args.depth == 2
    assert args.files == []


def test_parser_graph_test_radius_flags():
    parser = build_parser()
    args = parser.parse_args(
        ["graph", "test-radius", "--base", "HEAD~3", "--depth", "4", "--max-targets", "12", "src/a.ts"]
    )
    assert args.command == "graph"
    assert args.graph_command == "test-radius"
    assert args.base == "HEAD~3"
    assert args.depth == 4
    assert args.max_targets == 12
    assert args.files == ["src/a.ts"]


def test_parser_graph_query():
    parser = build_parser()
    args = parser.parse_args(["graph", "query", "tests_for", "MyService.run", "--json"])
    assert args.command == "graph"
    assert args.graph_command == "query"
    assert args.pattern == "tests_for"
    assert args.target == "MyService.run"
    assert args.json is True


def test_parser_graph_history():
    parser = build_parser()
    args = parser.parse_args(["graph", "history", "--count", "5", "--ref", "main"])
    assert args.command == "graph"
    assert args.graph_command == "history"
    assert args.count == 5
    assert args.ref == "main"


def test_parser_graph_review_context():
    parser = build_parser()
    args = parser.parse_args(
        [
            "graph",
            "review-context",
            "--base",
            "HEAD~2",
            "--depth",
            "3",
            "--max-targets",
            "10",
            "--max-files",
            "4",
            "--max-lines-per-file",
            "80",
            "--no-source",
            "src/a.ts",
        ]
    )
    assert args.command == "graph"
    assert args.graph_command == "review-context"
    assert args.base == "HEAD~2"
    assert args.depth == 3
    assert args.max_targets == 10
    assert args.max_files == 4
    assert args.max_lines_per_file == 80
    assert args.no_source is True
    assert args.files == ["src/a.ts"]


def test_parser_no_command():
    parser = build_parser()
    args = parser.parse_args([])
    assert args.command is None


def test_parser_help_formats_without_error():
    parser = build_parser()
    help_text = parser.format_help()
    assert "routa-fitness" in help_text
    assert "validate" in help_text


def test_domains_from_files():
    domains = _domains_from_files(
        [
            "crates/routa-server/src/main.rs",
            "src/app/page.tsx",
            "tools/routa-fitness/routa_fitness/cli.py",
            "api-contract.yaml",
        ]
    )
    assert domains == {"rust", "web", "python", "config"}


def test_metric_domains():
    assert _metric_domains(Metric(name="a", command="cargo clippy --workspace")) == {"rust"}
    assert _metric_domains(Metric(name="b", command="npm run lint")) == {"web"}
    assert _metric_domains(Metric(name="c", command="python3 -m pytest")) == {"python"}
    assert _metric_domains(Metric(name="d", command="npm audit --audit-level=critical")) == {
        "web",
        "config",
    }
