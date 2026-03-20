"""Evidence loader — parse YAML frontmatter into Dimension objects."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path
from typing import TypeVar

import yaml

from routa_fitness.model import (
    AnalysisMode,
    Confidence,
    Dimension,
    EvidenceType,
    ExecutionScope,
    FitnessKind,
    Gate,
    Metric,
    Stability,
    Tier,
    Waiver,
)

# Files to skip when scanning the fitness directory
_SKIP_FILES = {"README.md", "REVIEW.md"}
_MANIFEST_FILE = "manifest.yaml"
_EnumT = TypeVar("_EnumT")


def parse_frontmatter(content: str) -> dict | None:
    """Extract YAML frontmatter from markdown content."""
    match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
    if not match:
        return None
    return yaml.safe_load(match.group(1))


def _parse_enum(raw: dict, key: str, enum_type: type[_EnumT], default: _EnumT) -> _EnumT:
    """Parse an enum value from frontmatter, falling back safely on invalid values."""
    value = raw.get(key)
    if value is None:
        return default
    try:
        return enum_type(value)
    except ValueError:
        return default


def _parse_waiver(raw: dict) -> Waiver | None:
    """Parse optional waiver metadata."""
    waiver = raw.get("waiver")
    if not isinstance(waiver, dict):
        return None

    expires_at = waiver.get("expires_at")
    parsed_expires_at: date | None = None
    if isinstance(expires_at, date):
        parsed_expires_at = expires_at
    elif isinstance(expires_at, str):
        try:
            parsed_expires_at = date.fromisoformat(expires_at)
        except ValueError:
            parsed_expires_at = None

    return Waiver(
        reason=str(waiver.get("reason", "")),
        owner=str(waiver.get("owner", "")),
        tracking_issue=waiver.get("tracking_issue"),
        expires_at=parsed_expires_at,
    )


def _parse_string_list(raw: dict, key: str) -> list[str]:
    """Return a normalized list of strings or an empty list for invalid input."""
    value = raw.get(key)
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _build_metric(raw: dict) -> Metric:
    """Convert a raw YAML metric dict into a Metric dataclass."""
    tier = _parse_enum(raw, "tier", Tier, Tier.NORMAL)
    hard_gate = raw.get("hard_gate", False)

    return Metric(
        name=raw.get("name", "unknown"),
        command=raw.get("command", ""),
        pattern=raw.get("pattern", ""),
        hard_gate=hard_gate,
        tier=tier,
        description=raw.get("description", ""),
        kind=_parse_enum(raw, "kind", FitnessKind, FitnessKind.ATOMIC),
        analysis=_parse_enum(raw, "analysis", AnalysisMode, AnalysisMode.STATIC),
        execution_scope=_parse_enum(raw, "execution_scope", ExecutionScope, ExecutionScope.LOCAL),
        gate=_parse_enum(
            raw,
            "gate",
            Gate,
            Gate.HARD if hard_gate else Gate.SOFT,
        ),
        stability=_parse_enum(raw, "stability", Stability, Stability.DETERMINISTIC),
        evidence_type=_parse_enum(raw, "evidence_type", EvidenceType, EvidenceType.COMMAND),
        scope=_parse_string_list(raw, "scope"),
        run_when_changed=_parse_string_list(raw, "run_when_changed"),
        timeout_seconds=raw.get("timeout_seconds"),
        owner=raw.get("owner", ""),
        confidence=_parse_enum(raw, "confidence", Confidence, Confidence.UNKNOWN),
        waiver=_parse_waiver(raw),
    )


def _load_manifest_paths(fitness_dir: Path) -> list[Path] | None:
    """Return manifest-listed evidence files when a manifest exists."""
    manifest_path = fitness_dir / _MANIFEST_FILE
    if not manifest_path.is_file():
        return None

    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    evidence_files = manifest.get("evidence_files")
    if not isinstance(evidence_files, list):
        return []

    paths: list[Path] = []
    for entry in evidence_files:
        if not isinstance(entry, str):
            continue
        candidate = Path(entry)
        if not candidate.is_absolute():
            candidate = (fitness_dir.parent.parent / candidate).resolve()
        paths.append(candidate)
    return paths


def _discover_evidence_files(fitness_dir: Path) -> list[Path]:
    """Find evidence files from manifest or the legacy top-level glob."""
    manifest_paths = _load_manifest_paths(fitness_dir)
    if manifest_paths is not None:
        return sorted(manifest_paths)
    return sorted(fitness_dir.glob("*.md"))


def load_dimensions(fitness_dir: Path) -> list[Dimension]:
    """Scan evidence files in fitness_dir for YAML frontmatter, return Dimension objects."""
    dimensions: list[Dimension] = []

    for md_file in _discover_evidence_files(fitness_dir):
        if not md_file.is_file():
            continue
        if md_file.name in _SKIP_FILES:
            continue

        content = md_file.read_text(encoding="utf-8")
        fm = parse_frontmatter(content)

        if not fm or "metrics" not in fm:
            continue

        threshold = fm.get("threshold", {})
        metrics = [_build_metric(m) for m in fm.get("metrics", [])]

        dim = Dimension(
            name=fm.get("dimension", "unknown"),
            weight=fm.get("weight", 0),
            threshold_pass=threshold.get("pass", 90),
            threshold_warn=threshold.get("warn", 80),
            metrics=metrics,
            source_file=md_file.relative_to(fitness_dir).as_posix() if md_file.is_relative_to(fitness_dir) else md_file.name,
        )
        dimensions.append(dim)

    return dimensions


def validate_weights(dimensions: list[Dimension]) -> tuple[bool, int]:
    """Check that dimension weights sum to 100%."""
    total = sum(d.weight for d in dimensions)
    return total == 100, total
