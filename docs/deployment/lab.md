# Private lab pilot

The public website and its optional local fallback are maintained in
[zellige-oss/landing](https://github.com/zellige-oss/landing).
This repository owns the private application, API and data.

- `compose.lab.yaml`: pilot bound to loopback port `18787`, with its persistent
  `zellige-lab_pilot-data` volume.
- `compose.tailscale.yaml`: optional pilot VPN connector and its persistent
  identity volume on a dedicated bridge.
- `deploy/tailscale/pilot.json`: TCP 443 forwarding without Funnel or SSH.
- `deploy/Caddyfile.lab`: pilot routes to merge into the existing private proxy.
- `deploy/init-pilot.mjs`: initializes the ignored `.runtime/pilot.env` with a
  random access key and mode `0600`, without replacing an existing key.

```sh
node deploy/init-pilot.mjs
docker compose -f compose.lab.yaml -f compose.tailscale.yaml up -d --build
```

Enroll new connectors explicitly using a one-time authorized key. Retain their
identity volumes when recreating containers. Do not use host networking.
Open `https://zellige-dev.lab.kzzazzk.tech` and provide the pilot token privately.
VPN membership does not replace API authentication.

## Existing installation migration

Splitting source repositories does not move running containers, proxy routes,
VPN identities or data. The old website connector may still exist under the
`zellige-lab` Compose project. Do not use `--remove-orphans` or `down -v` during
this migration. Its optional definition now lives in the website repository
and references the existing identity volume explicitly.

Review the live proxy before changing its binds: multiple Caddy instances can
share the default admin address, and file bind mounts may retain an old inode.
Validate the intended instance and mounted configuration before reloading.
Keep ingress networks while any proxy still binds their gateway addresses.

## Read-only checks

```sh
node deploy/check-lab-ingress.mjs
# Optional DNS override for the pilot only:
node deploy/check-lab-ingress.mjs 100.127.102.14
```

Checks cover HTTPS, health, missing bearer rejection, unexpected hostnames and
SSH refusal. They use the executing machine's identity; collaborator-device
access requires its own verification. These are commands, not a claim that
this migration has tested or changed the running deployment.

The private Vercel demo has a separate [deployment workflow](pilot-cd.md).
Keep the local pilot until replacement access and backend behavior are verified.
