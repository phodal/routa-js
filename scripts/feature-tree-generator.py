#!/usr/bin/env python3
"""
Feature Tree Generator - Auto-scan Routa.js features from code

Scans:
1. src/app/**/page.tsx - Frontend routes (user-facing pages)
2. api-contract.yaml - Backend API endpoints

Usage:
    python scripts/feature-tree-generator.py              # Table view
    python scripts/feature-tree-generator.py --save       # Save to docs/
    python scripts/feature-tree-generator.py --mermaid    # Mermaid diagram
"""

import sys
import re
import json
import argparse
from pathlib import Path
from collections import defaultdict

try:
    import yaml
    HAS_YAML = True
except ImportError:
    HAS_YAML = False

ROOT_DIR = Path(__file__).parent.parent
API_CONTRACT = ROOT_DIR / "api-contract.yaml"
APP_DIR = ROOT_DIR / "src" / "app"
OUTPUT_MD = ROOT_DIR / "docs" / "product-specs" / "FEATURE_TREE.md"


def parse_yaml_file(filepath):
    """Parse YAML file with fallback for missing yaml module."""
    if not filepath.exists():
        return None
    content = filepath.read_text(encoding="utf-8")
    if HAS_YAML:
        return yaml.safe_load(content)
    return None


def parse_page_comment(content):
    """Extract title and description from page.tsx JSDoc comment."""
    # Match: /** ... */
    match = re.search(r'/\*\*\s*(.*?)\s*\*/', content, re.DOTALL)
    if not match:
        return None, None

    comment = match.group(1)
    lines = [line.strip().lstrip('*').strip() for line in comment.split('\n')]
    lines = [l for l in lines if l]  # Remove empty lines

    if not lines:
        return None, None

    # First line is title (may include " - /route")
    title_line = lines[0]
    title_match = re.match(r'^(.+?)\s*[-—]\s*/.*$', title_line)
    title = title_match.group(1).strip() if title_match else title_line

    # Rest is description (join bullet points)
    desc_lines = lines[1:] if len(lines) > 1 else []
    description = ' '.join(desc_lines)[:200]  # Limit length

    return title, description


def scan_frontend_routes():
    """Scan src/app for page.tsx files to extract user-facing routes."""
    routes = []

    for page_file in APP_DIR.rglob("page.tsx"):
        # Skip API routes
        if "/api/" in str(page_file):
            continue

        # Get route path relative to app/
        rel_path = page_file.parent.relative_to(APP_DIR)
        route = "/" + str(rel_path).replace("\\", "/")
        if route == "/.":
            route = "/"

        # Convert Next.js dynamic routes: [id] -> :id
        route = re.sub(r"\[([^\]]+)\]", r":\1", route)

        # Parse page comment
        content = page_file.read_text(encoding="utf-8")
        title, description = parse_page_comment(content)

        # Fallback title from path
        if not title:
            if rel_path.name == ".":
                title = "Home"
            else:
                title = rel_path.name.replace("-", " ").replace("_", " ").title()

        routes.append({
            "route": route,
            "title": title,
            "description": description or "",
        })

    return sorted(routes, key=lambda x: x["route"])


def extract_api_features(api_contract):
    """Extract features from api-contract.yaml paths."""
    if not api_contract:
        return {}
    
    paths = api_contract.get("paths", {})
    domains = defaultdict(list)
    
    # Group endpoints by domain (first path segment after /api/)
    for path, methods in paths.items():
        # Extract domain from path: /api/agents -> agents
        match = re.match(r"/api/([^/]+)", path)
        if not match:
            continue
        domain = match.group(1)
        
        for method, spec in methods.items():
            if method not in ["get", "post", "put", "patch", "delete"]:
                continue
            operation_id = spec.get("operationId", "")
            summary = spec.get("summary", "")
            domains[domain].append({
                "path": path,
                "method": method.upper(),
                "operationId": operation_id,
                "summary": summary,
            })
    
    return dict(domains)


def build_feature_tree(routes, api_features):
    """Build unified feature tree from routes + API."""
    tree = {
        "name": "Routa.js",
        "description": "Multi-agent coordination platform",
        "children": []
    }

    # 1. Frontend Routes (User-facing pages)
    routes_node = {
        "id": "routes",
        "name": "Frontend Pages",
        "description": f"{len(routes)} user-facing pages",
        "children": []
    }

    for route in routes:
        routes_node["children"].append({
            "id": route["route"],
            "name": route["title"],
            "route": route["route"],
            "description": route.get("description", ""),
        })

    tree["children"].append(routes_node)

    # 2. API Endpoints (Backend)
    api_node = {
        "id": "api",
        "name": "API Endpoints",
        "description": f"{sum(len(eps) for eps in api_features.values())} REST endpoints",
        "children": []
    }

    domain_names = {
        "health": "Health", "agents": "Agents", "tasks": "Tasks",
        "notes": "Notes", "workspaces": "Workspaces", "sessions": "Sessions",
        "acp": "ACP", "mcp": "MCP", "a2a": "A2A",
        "skills": "Skills", "clone": "Clone", "github": "GitHub",
    }

    for domain, endpoints in sorted(api_features.items()):
        domain_node = {
            "id": f"api.{domain}",
            "name": domain_names.get(domain, domain.title()),
            "count": len(endpoints),
            "children": []
        }
        for ep in endpoints:
            domain_node["children"].append({
                "id": ep["operationId"],
                "name": f"{ep['method']} {ep['summary']}" if ep.get('summary') else f"{ep['method']} {ep['path']}",
                "path": ep["path"],
            })
        api_node["children"].append(domain_node)

    tree["children"].append(api_node)

    return tree


def render_markdown(tree, level=0):
    """Render feature tree as clean Markdown with tables."""
    lines = []

    # Header
    lines.append(f"# {tree['name']} — Product Feature Specification")
    lines.append("")
    lines.append(f"{tree.get('description', '')}. This document is auto-generated from:")
    lines.append("- Frontend routes: `src/app/**/page.tsx`")
    lines.append("- API contract: `api-contract.yaml`")
    lines.append("")
    lines.append("---")
    lines.append("")

    for section in tree.get("children", []):
        if section["id"] == "routes":
            # Frontend Pages as table
            lines.append("## Frontend Pages")
            lines.append("")
            lines.append("| Page | Route | Description |")
            lines.append("|------|-------|-------------|")
            for page in section.get("children", []):
                name = page.get("name", "")
                route = page.get("route", "")
                desc = page.get("description", "")[:80]  # Truncate for table
                if desc and not desc.endswith("."):
                    desc = desc.split(".")[0] if "." in desc else desc
                lines.append(f"| {name} | `{route}` | {desc} |")
            lines.append("")
            lines.append("---")
            lines.append("")

        elif section["id"] == "api":
            # API Endpoints grouped by domain
            lines.append("## API Endpoints")
            lines.append("")
            for domain in section.get("children", []):
                domain_name = domain.get("name", "")
                count = domain.get("count", len(domain.get("children", [])))
                lines.append(f"### {domain_name} ({count})")
                lines.append("")
                lines.append("| Method | Endpoint | Description |")
                lines.append("|--------|----------|-------------|")
                for ep in domain.get("children", []):
                    name = ep.get("name", "")
                    path = ep.get("path", "")
                    # Parse method from name: "GET List agents" -> GET, "List agents"
                    parts = name.split(" ", 1)
                    method = parts[0] if len(parts) > 1 else "?"
                    desc = parts[1] if len(parts) > 1 else name
                    lines.append(f"| {method} | `{path}` | {desc} |")
                lines.append("")

    return lines


def render_mermaid(tree):
    """Render feature tree as Mermaid mindmap."""
    lines = ["mindmap", f"  root(({tree['name']}))"]

    def add_node(node, depth=2):
        indent = "  " * depth
        name = node.get("name", node.get("id", ""))
        # Escape special characters for Mermaid
        name = name.replace("(", "[").replace(")", "]").replace('"', "'")
        lines.append(f"{indent}{name}")
        for child in node.get("children", []):
            add_node(child, depth + 1)

    for child in tree.get("children", []):
        add_node(child)

    return "\n".join(lines)


def print_tree_table(tree):
    """Print feature tree as formatted table."""
    print("=" * 100)
    print("🌳 FEATURE TREE REPORT")
    print("=" * 100)
    print()

    def print_node(node, prefix="", is_last=True):
        connector = "└── " if is_last else "├── "
        name = node.get("name", node.get("id", ""))
        path = node.get("path", "")

        if path:
            print(f"{prefix}{connector}{name} [{path}]")
        else:
            print(f"{prefix}{connector}{name}")

        children = node.get("children", [])
        for i, child in enumerate(children):
            extension = "    " if is_last else "│   "
            print_node(child, prefix + extension, i == len(children) - 1)

    print(f"📦 {tree['name']}")
    print(f"   {tree.get('description', '')}")
    print()

    children = tree.get("children", [])
    for i, child in enumerate(children):
        print_node(child, "", i == len(children) - 1)

    # Summary
    def count_nodes(node):
        count = 1
        for child in node.get("children", []):
            count += count_nodes(child)
        return count

    total = count_nodes(tree) - 1  # Exclude root
    print()
    print("-" * 100)
    print(f"📊 Total features: {total}")


def main():
    parser = argparse.ArgumentParser(description="Generate product feature tree")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--mermaid", action="store_true", help="Output as Mermaid diagram")
    parser.add_argument("--save", action="store_true", help="Save to docs/product-specs/FEATURE_TREE.md")
    args = parser.parse_args()

    # Scan sources
    if not HAS_YAML:
        print("⚠️  PyYAML not installed. Run: pip install pyyaml", file=sys.stderr)
        sys.exit(1)

    routes = scan_frontend_routes()
    api_contract = parse_yaml_file(API_CONTRACT)
    api_features = extract_api_features(api_contract) if api_contract else {}

    # Build tree
    tree = build_feature_tree(routes, api_features)

    # Output
    if args.json:
        print(json.dumps(tree, indent=2, ensure_ascii=False))
    elif args.mermaid:
        print(render_mermaid(tree))
    elif args.save:
        OUTPUT_MD.parent.mkdir(parents=True, exist_ok=True)
        content = "\n".join(render_markdown(tree))
        OUTPUT_MD.write_text(content, encoding="utf-8")
        print(f"✅ Saved to {OUTPUT_MD}")
    else:
        print_tree_table(tree)


if __name__ == "__main__":
    main()

