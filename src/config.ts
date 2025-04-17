import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
// Get the directory name of the current module (e.g., /path/to/project/dist)
// Note: In ESM, __dirname is not available directly
const currentModuleDir = dirname(__filename); // Use a distinct name
// Construct the path to the .env file in the project root (one level up from dist)
const envPath = join(currentModuleDir, "..", ".env");

dotenv.config({ path: envPath }); // Load .env file variables using explicit path

console.log(`Attempting to load .env from: ${envPath}`);
console.log("AUTH_EMAIL loaded:", process.env.AUTH_EMAIL ? "Yes" : "No"); // Add logging

const packageVersion = JSON.parse(
  readFileSync(join(currentModuleDir, "..", "package.json"), "utf-8")
).version;

export const parseArguments = () => {
  return yargs(hideBin(process.argv))
    .option("endpoint", {
      alias: "e",
      description: "Default GraphQL endpoint URL",
      type: "string",
      default: process.env.ENDPOINT ?? "http://localhost:4000/graphql",
    })
    .option("authEndpoint", {
      description: "Authentication API endpoint URL (from .env)",
      type: "string",
      default: process.env.AUTH_API_ENDPOINT ?? "",
    })
    .option("authEmail", {
      description: "Authentication Email (from .env)",
      type: "string",
      default: process.env.AUTH_EMAIL ?? "",
    })
    .option("authPassword", {
      description: "Authentication Password (from .env)",
      type: "string",
      default: process.env.AUTH_PASSWORD ?? "",
    })
    .option("headers", {
      alias: "H",
      description: "Default headers for all requests (as JSON string)",
      type: "string",
    })
    .option("timeout", {
      alias: "t",
      description: "Default request timeout in milliseconds",
      type: "number",
      default: Number(process.env.TIMEOUT) ?? 30000,
    })
    .option("maxComplexity", {
      alias: "m",
      description: "Maximum allowed query complexity",
      type: "number",
      default: Number(process.env.MAX_DEPTH) ?? 100,
    })
    .help()
    .alias("help", "h")
    .version(packageVersion)
    .alias("version", "v")
    .parseSync();
};

export class Config {
  readonly endpoint: string;
  readonly authEndpoint: string;
  readonly authEmail: string;
  readonly authPassword: string;
  readonly maxQueryComplexity: number;
  readonly timeout: number;
  readonly headers: Record<string, string>;
  readonly version: string;
  readonly allowMutations: boolean;

  constructor() {
    const argv = parseArguments();

    this.endpoint = argv.endpoint;
    this.authEndpoint = argv.authEndpoint;
    this.authEmail = argv.authEmail;
    this.authPassword = argv.authPassword;
    this.maxQueryComplexity = argv.maxComplexity;
    this.timeout = argv.timeout;
    this.version = packageVersion;

    // Parse allowMutations from environment variable (default: false)
    // Ensures only exactly 'true' (case-insensitive) enables it.
    this.allowMutations = process.env.ALLOW_MUTATIONS?.toLowerCase() === "true";

    // Parse default headers
    this.headers = {};
    if (argv.headers) {
      try {
        Object.assign(this.headers, JSON.parse(argv.headers));
      } catch (e) {
        console.error("Error parsing default headers:", e);
        console.error("Headers should be a valid JSON object string");
        process.exit(1); // Exit if headers are invalid
      }
    }

    // Validate required auth config from .env
    if (!this.authEndpoint || !this.authEmail || !this.authPassword) {
      console.error(
        "Error: AUTH_API_ENDPOINT, AUTH_EMAIL, and AUTH_PASSWORD must be set in the .env file or passed as arguments."
      );
      process.exit(1); // Exit if auth config is missing
    }
  }
}

export const config = new Config();
