# Alice Connector Plane

Private Cloudflare service boundary for the existing Eliza Discord and Telegram
plugins. Provider bot credentials remain in this Worker and are never injected
into the Milady Container. Only the exact configured private destination can be
used. Outbound egress stays inert unless the Alice control plane returns an
exact release-bound `CAPABILITY_AUTHORIZED` decision for `social.message`.

Canonical connector identity, cursor and receipt records are stored through the
Alice state-plane service. A per-owner/channel Durable Object records an
outbound claim before provider egress, so a process or Container replacement
cannot resend an uncertain operation.

The Worker has no public route or workers.dev hostname. Production activation
still requires the three existing provider credential names
`DISCORD_API_TOKEN`, `DISCORD_APPLICATION_ID`, and `TELEGRAM_BOT_TOKEN`, two
exact private destination IDs, the private service tokens, and the Task 5
connector-authorization endpoint. Until all are present, each channel is inert.
