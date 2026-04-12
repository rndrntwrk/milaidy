import fs from 'fs';

const files = [
  "packages/agent/src/actions/send-admin-message.ts",
  "packages/agent/src/actions/send-message.ts",
  "packages/agent/src/config/types.eliza.ts",
  "packages/agent/src/evaluators/late-join-whitelist.ts",
  "packages/agent/src/providers/admin-panel.ts",
  "packages/agent/src/providers/admin-trust.ts",
  "packages/agent/src/providers/escalation-trigger.ts",
  "packages/agent/src/providers/role-backfill.ts",
  "packages/agent/src/runtime/owner-entity.ts",
  "packages/agent/src/runtime/roles/src/types.ts",
  "packages/agent/src/runtime/roles/src/utils.ts",
  "packages/agent/src/security/access.ts",
  "packages/shared/src/config/types.eliza.ts"
];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  const regex = /<<<<<<< HEAD\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>>[^\n]*\r?\n?/g;
  
  let matchCount = 0;
  const fixed = code.replace(regex, (match, head, theirs) => {
    matchCount++;
    return theirs;
  });
  
  if (matchCount > 0) {
    fs.writeFileSync(file, fixed, 'utf8');
    console.log(`Fixed ${matchCount} conflicts in ${file}`);
  } else {
    console.log(`No conflicts found in ${file}`);
  }
}
