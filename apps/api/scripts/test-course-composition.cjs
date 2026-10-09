// CommonJS only. DB suites remain gated by their dedicated disposable opt-ins.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function tests(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? tests(`${directory}/${entry.name}`) : entry.name.endsWith(".test.js") ? [`${directory}/${entry.name}`] : []);
}
const files = [
  ...tests("dist/src/modules/course-result-composition"), ...tests("dist/src/modules/final-formative"),
  ...tests("dist/src/modules/summative-examination"), ...tests("dist/src/common/academic-evidence"),
  ...tests("dist/prisma").filter((file) => /\/(?:course-result-composition|final-formative|summative-[^/]+)\./.test(file)),
].sort();
const result = spawnSync(process.execPath, ["--test", "--require", path.join(__dirname, "register-test-paths.cjs"), ...files],
  { cwd: root, stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
