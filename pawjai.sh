#!/usr/bin/env bash
# pawjai.sh — single entrypoint for local Docker dev across services.
# Usage: ./pawjai.sh <command> [options]
# Run with no args to see help.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'
C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'

info()  { printf '%b%s%b\n' "$C_BLUE" "▸ $*" "$C_RESET"; }
ok()    { printf '%b%s%b\n' "$C_GREEN" "✓ $*" "$C_RESET"; }
warn()  { printf '%b%s%b\n' "$C_YELLOW" "! $*" "$C_RESET"; }
fail()  { printf '%b%s%b\n' "$C_RED" "✗ $*" "$C_RESET" >&2; exit 1; }

hint() {
  cat <<EOF
${C_BOLD}pawjai.sh${C_RESET} — local Docker dev across pawjai services

${C_BOLD}USAGE${C_RESET}
  ./pawjai.sh <command> [options]

${C_BOLD}COMMANDS${C_RESET}
  ${C_GREEN}setup${C_RESET}                Bootstrap .env.dev from templates (run once)
  ${C_GREEN}dev${C_RESET}                  Start pawjai-be + pawjai-fe       → :3000 / :4000
  ${C_GREEN}admin${C_RESET}                Start pawjai-be + pawjai-admin    → :3001 / :4000
  ${C_GREEN}stop${C_RESET}                 Stop all pawjai containers
  ${C_GREEN}restart${C_RESET}              Restart running pawjai containers
  ${C_GREEN}logs${C_RESET} [service]       Tail logs (all, or one of pawjai-be/-fe/-admin)
  ${C_GREEN}status${C_RESET}               Show running containers
  ${C_GREEN}rebuild${C_RESET} <dev|admin>  Force-rebuild images for a profile
  ${C_GREEN}help${C_RESET}                 Full help with flags and examples

${C_DIM}Tip: \`./pawjai.sh help\` for flags (--build, --detach) and examples.${C_RESET}
EOF
}

usage() {
  cat <<EOF
${C_BOLD}pawjai.sh${C_RESET} — local Docker dev across pawjai services

${C_BOLD}USAGE${C_RESET}
  ./pawjai.sh <command> [options]

${C_BOLD}COMMANDS${C_RESET}
  ${C_GREEN}dev${C_RESET}            Start pawjai-be + pawjai-fe (dev: staging DB + staging Supabase)
  ${C_GREEN}admin${C_RESET}          Start pawjai-be + pawjai-admin (dev: staging DB + staging Supabase)
  ${C_GREEN}stop${C_RESET}           Stop all pawjai containers
  ${C_GREEN}restart${C_RESET}        Restart the active profile in place
  ${C_GREEN}logs${C_RESET} [service] Tail logs (all services or one of: pawjai-be, pawjai-fe, pawjai-admin)
  ${C_GREEN}status${C_RESET}         Show running containers
  ${C_GREEN}setup${C_RESET}          Bootstrap .env.dev files from .env.dev.example
  ${C_GREEN}rebuild${C_RESET}        Force rebuild images for the active profile

${C_BOLD}FLAGS${C_RESET} (apply to dev / admin / rebuild)
  --build         Build images before starting (auto on first run)
  --detach, -d    Run in background (default is foreground with logs)
  --no-deps       Don't start dependencies (mostly for debugging)

${C_BOLD}EXAMPLES${C_RESET}
  ./pawjai.sh setup        # one-time: copy .env.dev.example → .env.dev
  ./pawjai.sh dev          # fe + be on :3000 / :4000
  ./pawjai.sh admin        # admin + be on :3001 / :4000
  ./pawjai.sh logs pawjai-be
  ./pawjai.sh stop

${C_BOLD}URLS${C_RESET}
  ${C_DIM}fe       → http://localhost:3000${C_RESET}
  ${C_DIM}admin    → http://localhost:3001${C_RESET}
  ${C_DIM}backend  → http://localhost:4000${C_RESET}
EOF
}

install_hint_docker() {
  local os
  os="$(uname -s)"
  if [[ "$os" == "Darwin" ]]; then
    cat <<EOF

  ${C_BOLD}Install Docker on macOS${C_RESET}
    OrbStack (recommended, lightweight):
      ${C_DIM}brew install orbstack && open -a OrbStack${C_RESET}
    Or Docker Desktop:
      ${C_DIM}https://www.docker.com/products/docker-desktop${C_RESET}
EOF
  elif [[ "$os" == "Linux" ]]; then
    cat <<EOF

  ${C_BOLD}Install Docker on Linux${C_RESET}
    ${C_DIM}curl -fsSL https://get.docker.com | sh${C_RESET}
    ${C_DIM}sudo usermod -aG docker \$USER  # then log out / log in${C_RESET}
EOF
  else
    echo "    See https://docs.docker.com/get-docker/ for install instructions."
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    warn "docker not found on PATH."
    install_hint_docker
    fail "Install Docker, then re-run."
  fi
  if ! docker info >/dev/null 2>&1; then
    warn "docker daemon not reachable."
    if [[ "$(uname -s)" == "Darwin" ]]; then
      echo "  Open OrbStack (or Docker Desktop) and wait for it to finish starting."
      echo "  ${C_DIM}open -a OrbStack${C_RESET}"
    else
      echo "  Start the Docker service: ${C_DIM}sudo systemctl start docker${C_RESET}"
    fi
    fail "Start Docker, then re-run."
  fi
  if ! docker compose version >/dev/null 2>&1; then
    warn "Docker Compose v2 plugin not detected."
    echo "  OrbStack and modern Docker Desktop ship with it. If you're on an older Docker,"
    echo "  upgrade or install the plugin: ${C_DIM}https://docs.docker.com/compose/install/${C_RESET}"
    fail "Install/upgrade Docker Compose v2, then re-run."
  fi
}

require_submodules() {
  local missing=()
  for svc in pawjai-be pawjai-fe pawjai-admin; do
    if [[ ! -f "$SCRIPT_DIR/$svc/package.json" ]]; then
      missing+=("$svc")
    fi
  done
  if [[ "${#missing[@]:-0}" -gt 0 ]]; then
    warn "Submodule(s) not checked out: ${missing[*]}"
    if [[ -d "$SCRIPT_DIR/.git" || -f "$SCRIPT_DIR/.git" ]] && command -v git >/dev/null 2>&1; then
      info "Running: git submodule update --init --recursive"
      (cd "$SCRIPT_DIR" && git submodule update --init --recursive) || \
        fail "git submodule update failed. Resolve manually and re-run."
      ok "Submodules ready"
    else
      fail "Run from inside the pawjai repo with git available: ${C_DIM}git submodule update --init --recursive${C_RESET}"
    fi
  fi
}

ensure_env_file() {
  local svc="$1"
  local auto="${2:-0}"
  local file="$SCRIPT_DIR/$svc/.env.dev"
  local example="$SCRIPT_DIR/$svc/.env.dev.example"
  if [[ -f "$file" ]]; then
    return 0
  fi
  if [[ ! -f "$example" ]]; then
    warn "$svc/.env.dev.example missing. Cannot bootstrap $svc."
    return 1
  fi
  if [[ "$auto" -eq 1 ]]; then
    cp "$example" "$file"
    ok "Created $svc/.env.dev from template"
    BOOTSTRAPPED_ENV=1
    return 0
  fi
  warn "$svc/.env.dev missing. Run: ./pawjai.sh setup"
  return 1
}

preflight_envs() {
  local services=("$@")
  BOOTSTRAPPED_ENV=0
  local failed=0
  for svc in "${services[@]}"; do
    ensure_env_file "$svc" 1 || failed=1
  done
  if [[ "$failed" -eq 1 ]]; then
    fail "Could not bootstrap one or more .env.dev files."
  fi
  if [[ "$BOOTSTRAPPED_ENV" -eq 1 ]]; then
    echo
    warn "First-run env files were just created from templates."
    echo "  They include staging Supabase + Stripe TEST keys, but a few secrets are blank:"
    echo "    ${C_DIM}BUNNY_STORAGE_ACCESS_KEY${C_RESET} (uploads), ${C_DIM}STRIPE_WEBHOOK_SECRET${C_RESET} (webhooks),"
    echo "    ${C_DIM}ADMIN_JWT_SECRET${C_RESET} (must match across be + admin)."
    echo "  Fill them in pawjai-{be,fe,admin}/.env.dev if you need those features."
    echo
  fi
}

cmd_setup() {
  require_submodules
  local services=(pawjai-be pawjai-fe pawjai-admin)
  local created=0 skipped=0
  for svc in "${services[@]}"; do
    local file="$SCRIPT_DIR/$svc/.env.dev"
    local example="$SCRIPT_DIR/$svc/.env.dev.example"
    if [[ ! -f "$example" ]]; then
      warn "$svc/.env.dev.example not found — skipping"
      continue
    fi
    if [[ -f "$file" ]]; then
      info "$svc/.env.dev already exists — leaving as is"
      skipped=$((skipped + 1))
    else
      cp "$example" "$file"
      ok "Created $svc/.env.dev from template"
      created=$((created + 1))
    fi
  done
  echo
  ok "Setup done — created: $created, kept: $skipped"
  echo "Edit any required secrets (Bunny, Supabase service-role, etc.) then run:"
  echo "  ./pawjai.sh dev   # or  ./pawjai.sh admin"
}

run_compose() {
  local profile="$1"; shift
  local action="$1"; shift
  local extra_args=("$@")

  case "$action" in
    up)
      info "Starting profile '${profile}' (Ctrl-C to stop)"
      trap 'echo; info "Stopping profile ${profile}…"; docker compose --profile "${profile}" down' INT TERM
      docker compose --profile "${profile}" up ${extra_args[@]+"${extra_args[@]}"}
      trap - INT TERM
      ;;
    up-detached)
      info "Starting profile '${profile}' in background"
      docker compose --profile "${profile}" up -d ${extra_args[@]+"${extra_args[@]}"}
      ok "Up. Tail logs with: ./pawjai.sh logs"
      ;;
    rebuild)
      info "Rebuilding images for profile '${profile}'"
      docker compose --profile "${profile}" build --no-cache ${extra_args[@]+"${extra_args[@]}"}
      ;;
  esac
}

parse_dev_admin_flags() {
  BUILD_FLAG=""
  DETACH=0
  NO_DEPS=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --build) BUILD_FLAG="--build"; shift ;;
      --detach|-d) DETACH=1; shift ;;
      --no-deps) NO_DEPS="--no-deps"; shift ;;
      *) fail "Unknown flag: $1" ;;
    esac
  done
}

cmd_dev() {
  parse_dev_admin_flags "$@"
  require_submodules
  preflight_envs pawjai-be pawjai-fe
  require_docker
  local args=()
  [[ -n "$BUILD_FLAG" ]] && args+=("$BUILD_FLAG")
  [[ -n "$NO_DEPS" ]] && args+=("$NO_DEPS")
  if [[ "$DETACH" -eq 1 ]]; then
    run_compose dev up-detached ${args[@]+"${args[@]}"}
  else
    run_compose dev up ${args[@]+"${args[@]}"}
  fi
}

cmd_admin() {
  parse_dev_admin_flags "$@"
  require_submodules
  preflight_envs pawjai-be pawjai-admin
  require_docker
  local args=()
  [[ -n "$BUILD_FLAG" ]] && args+=("$BUILD_FLAG")
  [[ -n "$NO_DEPS" ]] && args+=("$NO_DEPS")
  if [[ "$DETACH" -eq 1 ]]; then
    run_compose admin up-detached ${args[@]+"${args[@]}"}
  else
    run_compose admin up ${args[@]+"${args[@]}"}
  fi
}

cmd_stop() {
  require_docker
  info "Stopping all pawjai containers"
  docker compose --profile dev --profile admin down
  ok "Stopped"
}

cmd_restart() {
  require_docker
  info "Restarting running pawjai containers"
  docker compose --profile dev --profile admin restart
  ok "Restarted"
}

cmd_logs() {
  require_docker
  if [[ $# -eq 0 ]]; then
    docker compose --profile dev --profile admin logs -f --tail=200
  else
    docker compose logs -f --tail=200 "$@"
  fi
}

cmd_status() {
  require_docker
  docker compose --profile dev --profile admin ps
}

cmd_rebuild() {
  require_docker
  if [[ $# -eq 0 ]]; then
    fail "rebuild needs a profile: ./pawjai.sh rebuild dev|admin"
  fi
  local profile="$1"
  case "$profile" in
    dev|admin) run_compose "$profile" rebuild ;;
    *) fail "Unknown profile: $profile (use 'dev' or 'admin')" ;;
  esac
}

main() {
  if [[ $# -eq 0 ]]; then
    hint; exit 0
  fi

  local cmd="$1"; shift
  case "$cmd" in
    dev)         cmd_dev "$@" ;;
    admin)       cmd_admin "$@" ;;
    stop|down)   cmd_stop ;;
    restart)     cmd_restart ;;
    logs)        cmd_logs "$@" ;;
    status|ps)   cmd_status ;;
    setup)       cmd_setup ;;
    rebuild)     cmd_rebuild "$@" ;;
    -h|--help|help) usage ;;
    *) hint; fail "Unknown command: $cmd" ;;
  esac
}

main "$@"
