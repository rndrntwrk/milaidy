# Operating Rules

1. Repo-local docs are canonical.
2. High-risk or destructive actions require explicit gating, approval, or both.
3. Claims about safety, deployability, autonomy, or reliability must be backed
   by named evidence.
4. Dated audits are evidence, not substitute architecture docs, unless they are
   promoted into evergreen canon.
5. Identity and ownership questions must resolve cleanly:
   - Milady is the host/runtime product.
   - Alice is a high-trust operating persona/runtime.
   - 555-bot is the deployer and production assembly path.
6. Knowledge must distinguish:
   - runtime-native corpus
   - production-synced corpus
   - public docs
7. If operator setup requires more than one repo, the bootstrap flow must say so
   explicitly and define the order.
