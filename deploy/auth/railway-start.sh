#!/usr/bin/env bash
set -euo pipefail

# Keycloak's startup realm import preserves existing realms. This separate, additive
# client import upgrades an existing deployment without replacing users or secrets.
umask 077
mkdir -p /opt/keycloak/data/import
printf '%s' "$ARMATURE_REALM_JSON" > /opt/keycloak/data/import/armature-realm.json

# Preparing SMTP does not turn on account emails before DNS/delivery verification.
# Neither mode enables public registration or changes existing users/clients.
email_mode=${ARMATURE_EMAIL_MODE:-off}
case "$email_mode" in
  off|prepared|enabled) ;;
  *) printf '%s\n' 'Armature email setup failed: invalid mode.' >&2; exit 1 ;;
esac
if [[ "$email_mode" != off ]]; then
  # Resend keys have a constrained alphabet. Validate before inserting into JSON;
  # never interpolate arbitrary environment content or pass secrets in argv.
  if [[ ! "${ARMATURE_RESEND_API_KEY:-}" =~ ^re_[A-Za-z0-9_]+$ ]]; then
    printf '%s\n' 'Armature email setup failed: missing or malformed sending key.' >&2
    exit 1
  fi
fi

if [[ -n "${ARMATURE_OPENAI_CLIENT_JSON:-}${ARMATURE_BILLING_CLIENT_JSON:-}" || "$email_mode" != off ]]; then
  (
    task_dir=$(mktemp -d /tmp/armature-oauth.XXXXXX)
    trap 'rm -rf -- "$task_dir"' EXIT
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
    for client_kind in openai billing; do
      if [[ "$client_kind" == openai ]]; then
        client_json=${ARMATURE_OPENAI_CLIENT_JSON:-}
        client_callback='https://chatgpt.com/connector_platform_oauth_redirect'
      else
        client_json=${ARMATURE_BILLING_CLIENT_JSON:-}
        client_callback='https://armature-mcp-production.up.railway.app/billing/callback'
      fi
      [[ -n "$client_json" ]] || continue
      printf '%s' "$client_json" > "$task_dir/client.json"
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
        --config "$task_dir/admin.config" -r armature -q "clientId=armature-$client_kind" \
        > "$task_dir/client-check.json"
      client_config=$(< "$task_dir/client-check.json")
      client_config=${client_config//[[:space:]]/}
      for required in \
        "\"clientId\":\"armature-$client_kind\"" \
        '"publicClient":true' \
        '"standardFlowEnabled":true' \
        '"implicitFlowEnabled":false' \
        '"directAccessGrantsEnabled":false' \
        '"serviceAccountsEnabled":false' \
        '"fullScopeAllowed":false' \
        '"consentRequired":true' \
        "\"redirectUris\":[\"$client_callback\"]" \
        '"webOrigins":[]' \
        '"exclude.issuer.from.auth.response":"false"' \
        '"pkce.code.challenge.method":"S256"'; do
        if [[ "$client_config" != *"$required"* ]]; then
          printf '%s\n' 'Armature OAuth client verification failed: configuration drift.' >&2
          exit 1
        fi
      done
      unset client_config
      printf '%s\n' "Armature OAuth verified: armature-$client_kind, exact callback, PKCE S256, consent, code flow only."
    done

    if [[ "$email_mode" != off ]]; then
      # kcadm reads this private file; the key never enters its command arguments.
      # Omit registrationAllowed entirely, preserving the separate launch gate.
      email_settings=''
      if [[ "$email_mode" == enabled ]]; then
        email_settings=',"verifyEmail":true,"resetPasswordAllowed":true'
      fi
      printf '{"smtpServer":{"host":"smtp.resend.com","port":"465","from":"no-reply@auth.viral-ventures-llc.com","fromDisplayName":"Armature 2D","user":"resend","password":"%s","auth":"true","ssl":"true","starttls":"false"}%s}' \
        "$ARMATURE_RESEND_API_KEY" "$email_settings" > "$task_dir/email.json"
      unset ARMATURE_RESEND_API_KEY
      if ! /opt/keycloak/bin/kcadm.sh update realms/armature \
        --config "$task_dir/admin.config" -f "$task_dir/email.json" \
        > "$task_dir/email-update.log" 2>&1; then
        printf '%s\n' 'Armature email setup failed: realm update rejected.' >&2
        exit 1
      fi
      rm -f -- "$task_dir/email.json"
      if ! /opt/keycloak/bin/kcadm.sh get realms/armature \
        --config "$task_dir/admin.config" \
        --fields smtpServer,verifyEmail,resetPasswordAllowed,registrationAllowed \
        > "$task_dir/email-check.json" 2> "$task_dir/email-check.log"; then
        printf '%s\n' 'Armature email verification failed: realm read unavailable.' >&2
        exit 1
      fi
      email_config=$(< "$task_dir/email-check.json")
      email_config=${email_config//[[:space:]]/}
      for required in \
        '"host":"smtp.resend.com"' \
        '"port":"465"' \
        '"from":"no-reply@auth.viral-ventures-llc.com"' \
        '"user":"resend"' \
        '"auth":"true"' \
        '"ssl":"true"' \
        '"starttls":"false"'; do
        if [[ "$email_config" != *"$required"* ]]; then
          printf '%s\n' 'Armature email verification failed: configuration drift.' >&2
          exit 1
        fi
      done
      if [[ "$email_mode" == enabled ]]; then
        for required in '"verifyEmail":true' '"resetPasswordAllowed":true'; do
          if [[ "$email_config" != *"$required"* ]]; then
            printf '%s\n' 'Armature email verification failed: account flow drift.' >&2
            exit 1
          fi
        done
      fi
      unset email_config
      printf '%s\n' "Armature email configuration verified: mode=$email_mode, Resend SMTP with TLS. Delivery requires a separate test."
    fi
  ) &
fi

# The bootstrap subshell already inherited the sending credential. Keycloak only
# needs the stored realm setting, so do not pass the extra secret to its process.
unset ARMATURE_RESEND_API_KEY
exec /opt/keycloak/bin/kc.sh start --import-realm
