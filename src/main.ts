import { createCli } from "./cli/index.js";

await createCli().parseAsync(process.argv);
