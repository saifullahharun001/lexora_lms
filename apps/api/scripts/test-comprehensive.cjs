// Uses the existing Nest/CommonJS compiler and Node test runner; no TS runtime loader.
// Run through `pnpm --filter @lexora/api test:comprehensive` to compile first.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

function tests(directory) {
  return fs.readdirSync(path.join(root, "dist", directory), { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? tests(`${directory}/${entry.name}`) :
      entry.name.endsWith(".test.js") ? [`dist/${directory}/${entry.name}`] : []);
}

const files = [
  ...tests("src/modules/examination-registration"),
  ...tests("src/modules/assessment"),
  ...tests("src/modules/authorization"),
  "dist/src/common/authorization/authorization-policy.service.test.js",
  ...tests("src/modules/summative-examination").filter((file) =>
    /(?:committee|candidate-roster|examiner-authority|examiner-marking-authority|management-authorizer)/.test(file)),
  "dist/prisma/authorization/provision-authorization.test.js",
  "dist/prisma/regular-comprehensive.schema.test.js",
  "dist/prisma/regular-comprehensive.database.test.js",
  "dist/prisma/formative-teacher-submission.schema.test.js",
  "dist/prisma/summative-examination-committee-foundation.schema.test.js",
  "dist/prisma/external-examination-committee-member.schema.test.js",
].sort();

const result = spawnSync(process.execPath, [
  "--test", "--require", path.join(__dirname, "register-test-paths.cjs"), ...files,
], { cwd: root, stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
