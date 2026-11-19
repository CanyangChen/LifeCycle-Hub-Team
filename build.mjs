import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { categories } from "./catalog.ts";

const css = (await readFile(new URL("./styles.css", import.meta.url), "utf8")).replace('@import "tailwindcss";', "");
const read = (file) => readFile(new URL(file, import.meta.url), "utf8");
const quantity = await read("./quantity.mjs");
const browser = quantity + "\n" + (await read("./browser.mjs")).replace(/^import[^\n]*\n/, "");
const requireDemoAuth = true;
const generated = `const catalog = ${JSON.stringify(categories)};\nconst styles = ${JSON.stringify(css + "button.button{border:0} a.button{text-decoration:none}")};\nconst browser = ${JSON.stringify(browser)};\n`;
const food = await read("./food.mjs");
const foodDates = await read("./food-dates.mjs");
const foodPortions = await read("./food-portions.mjs");
const intake = await read("./intake-provider.mjs") + "\n" + await read("./intake.mjs");
const drugs = await read("./drug.mjs") + "\n" + await read("./drug-plan.mjs") + "\n" + await read("./drug-intake.mjs") + "\n" + await read("./drug-safety.mjs");
const demoAuth = await read("./vendor/noble-argon2.js") + "\n" + await read("./demo-auth.mjs");
const journal = JSON.parse(await read("./drizzle/meta/_journal.json"));
const demoMigrations = await Promise.all(journal.entries.filter(({tag}) => !/_demo_/.test(tag)).map(async ({tag}) =>
  (await read("./drizzle/" + tag + ".sql")).split("--> statement-breakpoint").map((sql) => sql.trim()).filter(Boolean)));
const demoWorkspaces = "const demoMigrations = " + JSON.stringify(demoMigrations) + ";\n" + await read("./demo-workspace.mjs");
const wardrobe = await read("./wardrobe.mjs") + "\n" + await read("./wardrobe-intake.mjs");
const worker = (await read("./worker.mjs"))
  .replace('import { catalog, styles, browser } from "./generated.mjs";', () => generated + "const requireDemoAuth = " + requireDemoAuth + ";\n")
  .replace('import { parseQuantity } from "./quantity.mjs";', () => quantity)
  .replace('import { allFoodRows, ensureFoodData, foodActive, foodTasks, foodTitle, foodRoute } from "./food.mjs";', () => food + "\n" + foodDates + "\n" + intake + "\n" + foodPortions)
  .replace('import { demoAuthRoute } from "./demo-auth.mjs";', () => demoAuth + "\n" + demoWorkspaces)
  .replace('import { wardrobeRoute } from "./wardrobe.mjs";', () => wardrobe)
  .replace('import { drugHomeData, drugRoute } from "./drug.mjs";', () => drugs);
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await writeFile("dist/server/index.js", worker);
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
if (process.argv.includes("--test-legacy")) {
  await mkdir("test-results/legacy-worker", {recursive:true});
  await writeFile("test-results/legacy-worker/index.js", worker.replace("const requireDemoAuth = true;", "const requireDemoAuth = false;"));
}
