// CommonJS compiler output only. Database suites require their dedicated disposable opt-in variables.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function tests(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? tests(`${directory}/${entry.name}`) : entry.name.endsWith(".test.js") ? [`${directory}/${entry.name}`] : []);
}
const files = [
  ...tests("dist/src/modules/final-formative"), ...tests("dist/src/modules/attendance"),
  ...tests("dist/src/modules/class-session"),
  ...tests("dist/prisma").filter((file) => /\/(?:final-formative|formative-activities-finalisation|formative-attendance|attendance-mark-generation|ordinary-attendance-corrections)\./.test(file)),
].sort();
const result = spawnSync(process.execPath, ["--test", "--require", path.join(__dirname, "register-test-paths.cjs"), ...files],
  { cwd: root, stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
