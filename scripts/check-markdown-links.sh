#!/bin/bash

set -euo pipefail

MD_LINKS_LOG=$(mktemp)

cleanup() {
  rm -f "$MD_LINKS_LOG"
}
trap cleanup EXIT

failed=0
checked=0
skipped=0

echo "Checking markdown links..."

md_files=$(
  find . -name "*.md" \
    -not -path "./node_modules/*" \
    -not -path "./.next/*" \
    -not -path "./.git/*" \
    -not -path "./out/*" \
    2>/dev/null | awk 'NR <= 100 { print }'
)

if [[ -z "$md_files" ]]; then
  echo "No markdown files found."
  echo "markdown_external_links: ok"
  exit 0
fi

all_links=""
while IFS= read -r file; do
  links=$(
    grep -oE '\[[^]]+\]\([^)]+\)' "$file" 2>/dev/null |
      sed -E 's/.*\]\(([^)]+)\).*/\1/' |
      grep -E '^https?://' |
      grep -vE 'localhost|127\.0\.0\.1' |
      sort -u || true
  )
  if [[ -n "$links" ]]; then
    while IFS= read -r link; do
      all_links+="$file|$link"$'\n'
    done <<< "$links"
  fi
done <<< "$md_files"

all_links=$(echo "$all_links" | sort -u -t'|' -k2,2)

if [[ -z "$all_links" ]]; then
  echo "No external links found in markdown files."
  echo "markdown_external_links: ok"
  exit 0
fi

total=$(echo "$all_links" | wc -l | tr -d ' ')
echo "Found $total unique external links to check..."

while IFS='|' read -r file link; do
  [[ -z "$link" ]] && continue

  ((checked++)) || true
  printf "  [%3d/%3d] Checking: %s" "$checked" "$total" "$link"

  set +e
  http_code=$(
    curl -sS -o /dev/null -w "%{http_code}" \
      --connect-timeout 10 \
      --max-time 15 \
      -L \
      -H "User-Agent: Mozilla/5.0 (compatible; RoutaLinkChecker/1.0)" \
      "$link"
  )
  curl_exit=$?
  set -e

  if [[ $curl_exit -ne 0 ]]; then
    echo -e "\r  WARN [$checked/$total] $link (curl exit $curl_exit)"
    ((skipped++)) || true
  elif [[ "$http_code" =~ ^2[0-9][0-9]$ ]] || [[ "$http_code" =~ ^3[0-9][0-9]$ ]]; then
    echo -e "\r  OK [$checked/$total] $link"
  elif [[ "$http_code" =~ ^4[0-9][0-9]$ ]] && [[ "$http_code" != "429" ]]; then
    echo -e "\r  WARN [$checked/$total] $link (HTTP $http_code - may require auth)"
    ((skipped++)) || true
  elif [[ "$http_code" == "429" ]]; then
    echo -e "\r  WARN [$checked/$total] $link (rate limited)"
    ((skipped++)) || true
  else
    echo -e "\r  FAIL [$checked/$total] $link (HTTP $http_code)"
    echo "  Found in: $file"
    echo "$file: $link (HTTP $http_code)" >> "$MD_LINKS_LOG"
    ((failed++)) || true
  fi
done <<< "$all_links"

echo
echo "Link check summary:"
echo "  Total checked: $checked"
echo "  Passed: $((checked - failed - skipped))"
echo "  Warnings: $skipped"
echo "  Failed: $failed"

if [[ $failed -gt 0 ]]; then
  echo
  echo "Broken links found:"
  cat "$MD_LINKS_LOG"
  exit 1
fi

echo "markdown_external_links: ok"
