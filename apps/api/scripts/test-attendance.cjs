// Compile with the existing Nest/CommonJS build first. PostgreSQL suites opt in
// only through LEXORA_ATTENDANCE_TEST_DATABASE_URL + YES_DISPOSABLE confirmation.
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
  ...["attendance", "class-session", "authorization", "identity-access"].flatMap((name) => tests(`src/modules/${name}`)),
  ...tests("src/common/authorization"),
  "dist/src/modules/academic/attendance-academic-context.service.test.js",
  "dist/src/modules/eligibility/application/services/eligibility-attendance.regression.test.js",
  "dist/prisma/authorization/provision-authorization.test.js",
  ...["formative-attendance", "class-session-scheduled-end", "ordinary-attendance-corrections"]
    .flatMap((name) => ["schema", "database"].map((kind) => `dist/prisma/${name}.${kind}.test.js`)),
].sort();
const result = spawnSync(process.execPath, ["--test", "--require", path.join(__dirname, "register-test-paths.cjs"), ...files],
  { cwd: root, stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
