# Private lab preview

The public landing moved to <https://zellige.dev> on 2026-10-02; see
[Vercel deployment](vercel.md). Only its local application container was removed.
The pilot, database, VPN identities and shared proxy were preserved. The former
`zellige.lab.kzzazzk.tech` landing URL is retired, not redirected. Marketing is
now an opt-in local fallback under the `local-marketing` Compose profile.

- `marketing/`: static presentation page, no API, accounts, tracking or GitHub links.
- `compose.lab.yaml`: pilot on loopback `18787`, optional marketing on loopback
  `18788`. No public Docker ports. Normal startup starts only the pilot.
- `compose.tailscale.yaml`: two retained VPN ingress connectors, each on its own
  Docker bridge and persistent identity volume. Three containers remain in the
  deployed stack; the marketing connector is retained for rollback only.
- `deploy/tailscale/*.json`: TCP 443 forwarding only, with no Funnel, SSH,
  subnet routes, exit node, SOCKS proxy or administrative credentials mounted.
- `deploy/check-lab-ingress.mjs`: read-only HTTPS, hostname isolation, API
  authentication and SSH reachability regression checks; no tokens required.
- `deploy/Caddyfile.lab`: routes for the existing private host Caddy; TLS uses its
  existing DNS challenge configuration. Nothing changes in the public internet.
- `deploy/init-pilot.mjs`: creates `.runtime/pilot.env` with a random access key,
  permission `0600`, never overwriting an existing key. This directory is excluded
  from Git and both image builds. Share the key privately, not in URLs.
- `zellige-lab_pilot-data`: dedicated persistent SQLite/artifact volume. Only the
  pilot daemon opens SQLite. This does not reuse the development `data/` directory.

```sh
node deploy/init-pilot.mjs
docker compose -f compose.lab.yaml up -d --build
```

For the deployed private sharing configuration, include both Compose files:

```sh
docker compose -f compose.lab.yaml -f compose.tailscale.yaml up -d --build
```

Merge `deploy/Caddyfile.lab` into the existing host Caddy configuration, validate
inside its running container, and reload. Do not duplicate existing site blocks.
Create the ingress Docker networks before loading the Caddy binds. On a fresh
installation, enroll the connectors explicitly with one-time, non-ephemeral,
preauthorized auth keys tagged `tag:zellige`; Compose contains no bootstrap key.
After enrollment, `TS_AUTH_ONCE=true` and the state volumes allow recreation
without credentials. Never use `network_mode: host` for these connectors:
userspace Tailscale can forward other policy-allowed ports to local services.

This host has several Caddy instances sharing the default admin port `2019`
(including ChronoPol and the shared HTTPS proxy). Do not use a default-address
`caddy reload` blindly. Also verify the mounted file contents: replacing a file
on the host can leave a file bind mount pointing at the old inode. A container
recreation fixes that but briefly interrupts all shared lab routes and requires
coordination. The pre-change proxy file is saved locally under `.runtime/`.
For this deployment, the intended instance was identified by comparing its full
live configuration against the original file. The new configuration was sent
on that same verified HTTP connection, without a restart. Both hostnames were
then checked over HTTPS. Fixing the shared admin-port collision is separate
infrastructure work; do not assume subsequent default-address reloads are safe.

Rebuild the pilot after source changes with the same command. To explicitly
restore or update the optional local marketing fallback, without touching the pilot:

```sh
docker compose -f compose.lab.yaml up -d --build --no-deps --wait marketing
```

To recreate just the pilot
without losing data: `docker compose -f compose.lab.yaml up -d --force-recreate pilot`.
Do not use `down -v` unless deliberately deleting the pilot's data.

## Pilot deployment transition

The private Vercel demo has its own [deployment workflow](pilot-cd.md).
The previous host-only release script is not published or activated. Keep the
local pilot running until Google access and the replacement backend are verified.

Open `https://zellige-dev.lab.kzzazzk.tech`, then enter the value of
`ZELLIGE_API_TOKEN` from `.runtime/pilot.env` in **Ajustes → Clave de acceso**.
The key grants access to the whole pilot; this MVP has no per-user authorization.
The separate public landing is now `https://zellige.dev`.

## Private sharing

DNS now has explicit, DNS-only A records (TTL 60) overriding the lab wildcard:

| Domain | Tailscale node/IP | Exclusive Caddy listener | App upstream |
| --- | --- | --- | --- |
| `zellige.lab.kzzazzk.tech` | `zellige-marketing` / `100.83.63.120` | `10.204.87.1:443` | `127.0.0.1:18788` |
| `zellige-dev.lab.kzzazzk.tech` | `zellige-pilot` / `100.127.102.14` | `10.204.88.1:443` | `127.0.0.1:18787` |

The listeners bind the gateways of the dedicated `10.204.87.0/29` and
`10.204.88.0/29` Docker networks, not the public/LAN interfaces. Check for subnet
overlaps before reusing this host-specific configuration elsewhere. Each accepts
only its own hostname; an explicit fallback returns 404 for all other hosts.
TLS and renewal remain in the existing Caddy. The previous host-IP routes remain
available under their existing permissions, but are not granted to collaborators.
No connector forwards traffic to the host's shared `100.108.41.61:443` listener.

The tailnet policy now defines `tag:zellige`, an owner-managed `group:zellige`,
and one new grant from that group to `tag:zellige` on `tcp:443`. The group contains
the tailnet owner and the requested collaborator, Salim. Existing web grants,
groups and policy comments were preserved. Regression tests verify the new access,
deny shared-host HTTPS and MyBeReal to Salim, and preserve the other user's web access.
Salim's prior Japan Trip grant still exists; his web access is not limited to Zellige.

On 2026-10-02, the owner requested owner-only SSH throughout the tailnet. The
TCP 22 grant now names only the owner's account instead of `autogroup:member`.
The Tailscale SSH rule likewise names only the owner, retaining `check` mode and
`autogroup:self` destinations without expanding login permissions. All other
members and service-tag identities have no TCP 22 grant. Nine network tests and
three SSH tests passed, including both IP families, owner access, denial for
other members to their own devices, and unchanged web permissions. This is a
tailnet policy restriction; it does not change LAN/public firewall or SSH daemon
settings. The pre-change snapshot is retained locally under ignored
`.runtime/owner-only-ssh-GIkdmI/`; restoring it would re-enable the former broad
SSH rule and must not be done as a routine Zellige rollback.
The new connector namespaces have no SSH listener, verified with network probes.

Administrative OAuth credentials live in the operator profile at
`~/.config/tailscale/oauth.env` (mode 0600), outside this repository. They are never
mounted in containers or embedded in Compose. Enrollment used single-use auth
keys passed via stdin; only node state persists. The provided OAuth credential
has `all` scope: operational requests were downscoped, but the source credential
itself should be replaced with narrower scopes or revoked when no longer needed.

The historical two-app ingress checks below include the retired lab landing and
are expected to fail for that service unless the local fallback is explicitly
restored. For the active pilot, check `https://zellige-dev.lab.kzzazzk.tech/health`
(200) and unauthenticated `/v1/conversations` (401) from a permitted Tailscale device.
The full checks remain useful when testing both local applications:

```sh
node deploy/check-lab-ingress.mjs
# Before a DNS cutover, or while a resolver still caches the old wildcard:
node deploy/check-lab-ingress.mjs 100.83.63.120 100.127.102.14
```

These probes use the executing device's identity. Tailnet policy tests validate
Salim's identity; a final check on his actual device is still required. He must
connect Tailscale to the invited tailnet with his invited account. The pilot
additionally requires the Zellige bearer token; VPN permission is not app login.

Keep the connector identity volumes and ingress networks when recreating the
deployment. Do not remove the networks while Caddy still binds their gateway IPs.
Use both Compose files for the shared lab stack; avoid `--remove-orphans` with
only the base file. Local rollback snapshots of the original policy/Caddyfile
are retained under ignored `.runtime/`; do not blindly restore them over newer
administrative changes. To revert DNS, remove only the two explicit Zellige
records after reviewing current state; the previous wildcard then applies again.

## Future clients

The pilot's REST/OpenAPI contract is independent of the web UI. API types and
requests live in `web/src/api/`; browser session persistence is isolated in
`web/src/storage/`. An Electron renderer can reuse the web surface. A React
Native client can reuse the protocol and model, but not DOM/shadcn components;
it will need a native UI, secure credential storage and an absolute API URL.
No desktop/native scaffolding or claim of T3 Code architectural parity is made.

## Historical checks before the Vercel migration (2026-10-02)

- Both domains returned HTTPS 200 with valid certificates; landing → pilot
  navigation worked in the browser. Both containers were healthy.
- Desktop, phone and tablet layouts checked; light/dark app themes checked;
  shared assets loaded with no browser errors or horizontal overflow.
- 12 backend tests and 9 frontend tests passed; web lint and build passed.
- A message saved through the UI survived pilot container recreation. The
  synthetic conversation was then archived, not deleted.
- SQLite `quick_check=ok`, `journal_mode=wal`, no foreign key violations;
  unauthenticated API access returned 401.
- Existing Engram and ChronoPol endpoints still responded after proxy reload.
- Individual Tailscale access is configured for Salim through the dedicated
  nodes; web permissions were preserved. SSH was subsequently restricted to the
  owner, with all nine network tests and three SSH tests passing.
- All 13 ingress checks passed through both dedicated node IPs: HTTPS, API 401,
  cross-host/unrelated-host 404 and no reachable SSH service. Node IDs and IPs
  survived connector recreation without mounting administrative credentials.
- Both explicit DNS records are live and resolve to their dedicated nodes.
  Final end-to-end verification from Salim's own device remains user-side.
- No commit, push or GitHub publishing was performed.
