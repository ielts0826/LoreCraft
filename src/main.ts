import path from "node:path";

import { createCli } from "./cli/index.js";
import { launchTui } from "./tui/app.js";

if (process.argv.length <= 2) {
  await launchTui({ directory: path.resolve(process.cwd()) });
} else {
  await createCli().parseAsync(process.argv);
}
