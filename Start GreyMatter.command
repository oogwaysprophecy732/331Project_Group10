#!/bin/zsh
set -eu

project_dir="$(cd "$(dirname "$0")" && pwd)"
exec "$project_dir/backend/run_https.sh"
