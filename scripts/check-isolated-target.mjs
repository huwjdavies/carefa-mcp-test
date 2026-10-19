import { readFile } from "node:fs/promises";
import { validateIsolatedTarget } from "../deployment/target-policy.mjs";
const file = process.argv[2];
if (!file)
  throw Error(
    "Provide a reviewed non-secret target record; no resources will be changed",
  );
const errors = validateIsolatedTarget(JSON.parse(await readFile(file, "utf8")));
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else
  console.log(
    "Target evidence fields pass validation. This does not grant deployment or account-linking approval.",
  );
