#!/bin/bash
set -a
source "$(dirname "$0")/../.env.local"
set +a
exec npx tsx "$(dirname "$0")/check-schedules-db.ts"
