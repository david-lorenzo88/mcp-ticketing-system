#!/usr/bin/env bash
#
# Deploys the Baltic Summit ticketing system to Azure Container Apps.
#
#   ./scripts/deploy-azure.sh
#
# Everything is configurable through environment variables:
#
#   RESOURCE_GROUP    resource group name        (default: rg-baltic-summit-tickets)
#   LOCATION          Azure region               (default: westeurope)
#   NAME_PREFIX       prefix for resource names  (default: balticsummit)
#   PG_ADMIN_USER     PostgreSQL admin login     (default: balticadmin)
#   PG_ADMIN_PASSWORD PostgreSQL admin password  (generated if unset)
#   MCP_API_KEY       shared secret for /mcp     (default: empty = open, no auth)
#                     set to "generate" to have a strong key created and printed
#   IMAGE_TAG         container image tag        (default: current UTC timestamp)
#   PG_VERSION        PostgreSQL major version   (default: 16, auto-corrected)
#   PG_SKU            PostgreSQL compute SKU     (default: Standard_B1ms, auto-corrected)
#   PG_TIER           PostgreSQL tier            (default: Burstable, auto-corrected)
#
# The image is built by `az acr build` inside Azure, so no local Docker daemon
# is required.

set -euo pipefail

# Without this, any `set -e` abort before the first log line looks like the
# script did nothing at all.
trap 'status=$?; [[ $status -ne 0 ]] && printf "\n\033[1;31mDeployment aborted at line %s (exit %s).\033[0m\n" "$LINENO" "$status" >&2' ERR

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-baltic-summit-tickets}"
LOCATION="${LOCATION:-westeurope}"
NAME_PREFIX="${NAME_PREFIX:-balticsummit}"
PG_ADMIN_USER="${PG_ADMIN_USER:-balticadmin}"
MCP_API_KEY="${MCP_API_KEY:-}"
IMAGE_TAG="${IMAGE_TAG:-$(date -u +%Y%m%d%H%M%S)}"
IMAGE_NAME="baltic-tickets"
PG_VERSION="${PG_VERSION:-16}"
PG_SKU="${PG_SKU:-Standard_B1ms}"
PG_TIER="${PG_TIER:-Burstable}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

info() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# Random token of $1 characters drawn from the class $2.
#
# `head` exits as soon as it has enough bytes, which closes the pipe and kills
# `tr` with SIGPIPE. Under `set -o pipefail` that would abort the whole script,
# so the pipeline runs in a subshell with pipefail switched off.
random_token() {
  ( set +o pipefail; LC_ALL=C tr -dc "$2" </dev/urandom | head -c "$1" )
}

command -v az >/dev/null 2>&1 || fail "The Azure CLI is not installed. See https://aka.ms/azure-cli"
az account show >/dev/null 2>&1 || fail "Not signed in to Azure. Run: az login"

# "generate" keeps the key out of your shell history and out of this script's
# arguments; it is printed once at the end and stored as a Container App secret.
if [[ "${MCP_API_KEY}" == "generate" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    MCP_API_KEY="$(openssl rand -hex 32)"
  else
    MCP_API_KEY="$(random_token 64 'a-f0-9')"
  fi
  GENERATED_MCP_KEY=1
fi

if [[ -z "${PG_ADMIN_PASSWORD:-}" ]]; then
  # 24 URL-safe characters. Bicep URL-encodes it into the connection string
  # anyway, but a clean password keeps manual psql access simple.
  PG_ADMIN_PASSWORD="$(random_token 24 'A-Za-z0-9')"
  GENERATED_PASSWORD=1
fi

SUBSCRIPTION="$(az account show --query name -o tsv)"

info "Deploying to subscription: ${SUBSCRIPTION}"
echo "  Resource group : ${RESOURCE_GROUP}"
echo "  Location       : ${LOCATION}"
echo "  Image tag      : ${IMAGE_TAG}"
echo "  MCP auth       : $([[ -n "${MCP_API_KEY}" ]] && echo 'API key' || echo 'open (no authentication)')"

info "Creating resource group"
az group create --name "${RESOURCE_GROUP}" --location "${LOCATION}" --output none

# Fresh subscriptions often have these unregistered, which surfaces later as
# confusing validation errors (an empty list of allowed PostgreSQL versions,
# for instance) rather than a clear "provider not registered".
info "Registering resource providers"
for ns in Microsoft.App Microsoft.ContainerRegistry Microsoft.DBforPostgreSQL Microsoft.OperationalInsights; do
  state="$(az provider show --namespace "$ns" --query registrationState -o tsv 2>/dev/null || echo Unknown)"
  if [[ "$state" == "Registered" ]]; then
    echo "  $ns: already registered"
  else
    echo "  $ns: $state — registering (this can take a minute)…"
    az provider register --namespace "$ns" --wait 2>/dev/null || \
      echo "    could not register $ns automatically; you may need an Owner/Contributor to do it"
  fi
done

# Which PostgreSQL versions and SKUs exist depends on subscription, region and
# tier. Checking now — rather than after the image build — turns a three-minute
# round trip into a few seconds.
info "Checking PostgreSQL availability in ${LOCATION}"
SKUS_FILE="$(mktemp)"
if az postgres flexible-server list-skus --location "${LOCATION}" -o json >"${SKUS_FILE}" 2>/dev/null; then
  if CHOICE="$(python3 - "${SKUS_FILE}" "${PG_TIER}" "${PG_VERSION}" "${PG_SKU}" <<'PYEOF'
import json, sys

path, want_tier, want_version, want_sku = sys.argv[1:5]
tiers = json.load(open(path))

catalogue = {}
for tier in tiers:
    versions = {}
    for v in tier.get("supportedServerVersions", []):
        versions[str(v.get("name"))] = [s.get("name") for s in v.get("supportedSkus", [])]
    if versions:
        catalogue[tier.get("name")] = versions

if not catalogue:
    sys.exit("no PostgreSQL Flexible Server capacity is offered here")

tier = want_tier if want_tier in catalogue else next(
    (t for t in ("Burstable", "GeneralPurpose", "MemoryOptimized") if t in catalogue),
    next(iter(catalogue)))

versions = catalogue[tier]
if want_version in versions:
    version = want_version
else:
    # Highest major version available, so a pinned-but-retired default still works.
    version = max(versions, key=lambda v: int(v) if v.isdigit() else -1)

skus = versions[version]
sku = want_sku if want_sku in skus else (sorted(skus)[0] if skus else "")
if not sku:
    sys.exit(f"no SKUs offered for {tier} / PostgreSQL {version} in this region")

print(f"{tier}\t{version}\t{sku}")
PYEOF
  )"; then
    IFS=$'\t' read -r PG_TIER_OK PG_VERSION_OK PG_SKU_OK <<<"${CHOICE}"
    if [[ "${PG_TIER_OK}/${PG_VERSION_OK}/${PG_SKU_OK}" != "${PG_TIER}/${PG_VERSION}/${PG_SKU}" ]]; then
      echo "  Requested ${PG_TIER} / PostgreSQL ${PG_VERSION} / ${PG_SKU} is not offered here."
      echo "  Using    ${PG_TIER_OK} / PostgreSQL ${PG_VERSION_OK} / ${PG_SKU_OK} instead."
    else
      echo "  ${PG_TIER} / PostgreSQL ${PG_VERSION} / ${PG_SKU}"
    fi
    PG_TIER="${PG_TIER_OK}"; PG_VERSION="${PG_VERSION_OK}"; PG_SKU="${PG_SKU_OK}"
  else
    fail "PostgreSQL Flexible Server is not available in ${LOCATION} for this subscription.
  Try a different region, e.g.  LOCATION=polandcentral ./scripts/deploy-azure.sh
  Or list the regions that work:  az postgres flexible-server list-skus --location <region> -o table"
  fi
else
  echo "  Could not query availability — continuing and letting Azure validate."
fi
rm -f "${SKUS_FILE}"

info "Creating the container registry"
REGISTRY_NAME="$(az deployment group create \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${ROOT_DIR}/infra/registry.bicep" \
  --parameters namePrefix="${NAME_PREFIX}" location="${LOCATION}" \
  --query 'properties.outputs.registryName.value' -o tsv)"

[[ -n "${REGISTRY_NAME}" ]] || fail "Could not determine the registry name."
echo "  Registry: ${REGISTRY_NAME}"

info "Building the image in Azure (this takes a few minutes the first time)"
az acr build \
  --registry "${REGISTRY_NAME}" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  --image "${IMAGE_NAME}:latest" \
  --file "${ROOT_DIR}/Dockerfile" \
  "${ROOT_DIR}"

LOGIN_SERVER="$(az acr show --name "${REGISTRY_NAME}" --query loginServer -o tsv)"
FULL_IMAGE="${LOGIN_SERVER}/${IMAGE_NAME}:${IMAGE_TAG}"

info "Deploying database, Container Apps environment and the app"
OUTPUTS="$(az deployment group create \
  --resource-group "${RESOURCE_GROUP}" \
  --template-file "${ROOT_DIR}/infra/main.bicep" \
  --parameters \
    namePrefix="${NAME_PREFIX}" \
    location="${LOCATION}" \
    registryName="${REGISTRY_NAME}" \
    containerImage="${FULL_IMAGE}" \
    postgresAdminUser="${PG_ADMIN_USER}" \
    postgresAdminPassword="${PG_ADMIN_PASSWORD}" \
    postgresVersion="${PG_VERSION}" \
    postgresSkuName="${PG_SKU}" \
    postgresTier="${PG_TIER}" \
    mcpApiKey="${MCP_API_KEY}" \
  --query 'properties.outputs' -o json)"

read_output() { echo "${OUTPUTS}" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1']['value'])"; }

APP_URL="$(read_output appUrl)"
MCP_URL="$(read_output mcpEndpoint)"
MCP_HOST="$(read_output mcpHost)"
MCP_AUTH="$(read_output mcpAuthMode)"

# The container runs `prisma migrate deploy` on start, so the schema is already
# in place by the time the readiness probe passes.
info "Deployment complete"
cat <<SUMMARY

  Web UI        ${APP_URL}
  REST API      ${APP_URL}/api/tickets
  MCP endpoint  ${MCP_URL}   (auth: ${MCP_AUTH})
  Health        ${APP_URL}/healthz  ·  ${APP_URL}/readyz

  Connector host (Copilot Studio): ${MCP_HOST}

SUMMARY

if [[ -n "${GENERATED_MCP_KEY:-}" ]]; then
  cat <<SECRET
  An MCP API key was generated. Store it in a password manager now — it is not
  printed again. Agents send it as the header 'x-api-key' (Copilot Studio) or
  'Authorization: Bearer <key>':

      ${MCP_API_KEY}

  Verify the endpoint rejects unauthenticated calls and accepts this key:

      MCP_URL=${MCP_URL} MCP_API_KEY=${MCP_API_KEY} \\
        node scripts/smoke-test-mcp.mjs

SECRET
fi

if [[ -n "${GENERATED_PASSWORD:-}" ]]; then
  cat <<SECRET
  A PostgreSQL admin password was generated. Store it somewhere safe — it is
  not printed again, and it is already stored as a Container App secret:

      ${PG_ADMIN_PASSWORD}

SECRET
fi

echo "  Next: docs/copilot-studio.md  or  docs/azure-ai-foundry.md"
echo
