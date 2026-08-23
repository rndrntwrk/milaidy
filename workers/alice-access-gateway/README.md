# Alice Access gateway

Source-controlled authenticated ingress for the production Alice runtime. The
Cloudflare Access edge policy runs first; this Worker independently verifies the
signed Access JWT against the exact application audience and owner identity,
strips Access cookies and caller credentials, injects one scoped trusted-proxy
proof, and proxies to the exact Modal runtime origin. The more-specific
`/control/*` route remains owned by `alice-production-control`.
