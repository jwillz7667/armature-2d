#!/usr/bin/env bash
set -euo pipefail

# Keycloak's startup realm import preserves existing realms. This separate, additive
# client import upgrades an existing deployment without replacing users or secrets.
umask 077
mkdir -p /opt/keycloak/data/import
printf '%s' "$ARMATURE_REALM_JSON" > /opt/keycloak/data/import/armature-realm.json

if [[ -n "${ARMATURE_OPENAI_CLIENT_JSON:-}" ]]; then
  (
    task_dir=$(mktemp -d /tmp/armature-oauth.XXXXXX)
    trap 'rm -rf -- "$task_dir"' EXIT
    printf '%s' "$ARMATURE_OPENAI_CLIENT_JSON" > "$task_dir/client.json"
    # The existing admin secret stays inside its service. Never put it in argv,
    # print it, copy it to the MCP service, or persist a new admin credential.
    export KC_CLI_PASSWORD="$KC_BOOTSTRAP_ADMIN_PASSWORD"
    export JAVA_OPTS='-Xms16m -Xmx96m'
    ready=0
    for attempt in {1..30}; do
      if /opt/keycloak/bin/kcadm.sh config credentials \
        --config "$task_dir/admin.config" --server http://localhost:8080 \
        --realm master --user "$KC_BOOTSTRAP_ADMIN_USERNAME" \
        > "$task_dir/login.log" 2>&1; then
        ready=1
        break
      fi
      sleep 2
    done
    unset KC_CLI_PASSWORD
    if [[ "$ready" != 1 ]]; then
      printf '%s\n' 'Armature OAuth client setup failed: admin login unavailable.' >&2
      exit 1
    fi
    if ! /opt/keycloak/bin/kcadm.sh create partialImport \
      --config "$task_dir/admin.config" -r armature \
      -s ifResourceExists=SKIP -f "$task_dir/client.json" \
      > "$task_dir/import.log" 2>&1; then
      printf '%s\n' 'Armature OAuth client setup failed: additive import rejected.' >&2
      exit 1
    fi
    printf '%s\n' 'Armature OAuth client additive import completed.'
    # Keep the response private: log only the successful security checks. SKIP
    # preserves an existing client, so import success alone is not verification.
    /opt/keycloak/bin/kcadm.sh get clients \
      --config "$task_dir/admin.config" -r armature -q clientId=armature-openai \
      > "$task_dir/client-check.json"
    client_config=$(< "$task_dir/client-check.json")
    client_config=${client_config//[[:space:]]/}
    for required in \
      '"clientId":"armature-openai"' \
      '"publicClient":true' \
      '"standardFlowEnabled":true' \
      '"implicitFlowEnabled":false' \
      '"directAccessGrantsEnabled":false' \
      '"serviceAccountsEnabled":false' \
      '"fullScopeAllowed":false' \
      '"consentRequired":true' \
      '"redirectUris":["https://chatgpt.com/connector_platform_oauth_redirect"]' \
      '"pkce.code.challenge.method":"S256"'; do
      if [[ "$client_config" != *"$required"* ]]; then
        printf '%s\n' 'Armature OAuth client verification failed: configuration drift.' >&2
        exit 1
      fi
    done
    unset client_config
    printf '%s\n' 'Armature OAuth verified: public client, exact OpenAI callback, PKCE S256, consent, code flow only.'
  ) &
fi

exec /opt/keycloak/bin/kc.sh start --import-realm
