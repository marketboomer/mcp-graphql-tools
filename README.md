# GraphQL MCP Tools

A Model Context Protocol (MCP) server implementation that provides authenticated GraphQL API interaction capabilities. This server enables AI assistants to interact with GraphQL APIs through a set of standardized tools, handling authentication token fetching and caching automatically.

## Features

- Executes GraphQL queries and mutations (if enabled).
- Performs GraphQL schema introspection.
- Handles authentication automatically by fetching and caching tokens from a specified authentication endpoint.
- Configurable via a `.env` file.
- Basic query complexity checking.

## Configuration

Configuration is primarily handled through a `.env` file placed in the project root (`/Users/shaynes/Code/mcp-graphql-tools/.env`).

**Required Environment Variables:**

- `AUTH_API_ENDPOINT`: The base URL for your authentication API (e.g., `https://auth.example.com`). The tool expects a sign-in endpoint at `/access/api/auth/sign_in` relative to this URL.
- `AUTH_EMAIL`: The email address to use for authentication.
- `AUTH_PASSWORD`: The password to use for authentication.

**Optional Environment Variables:**

- `ENDPOINT`: The default GraphQL endpoint URL if not provided per request (e.g., `https://api.example.com/graphql`). Defaults to `http://localhost:4000/graphql` if unset.
- `TIMEOUT`: Default request timeout in milliseconds for both GraphQL and authentication requests (default: `30000`).
- `MAX_DEPTH` (Renamed from `maxComplexity` in `.env`, but maps to `maxQueryComplexity` internally): Maximum allowed query complexity based on field count (default: `100`).
- `HEADERS`: Default headers for _GraphQL_ requests as a JSON string (e.g., `'{"X-Custom-Header": "value"}'`). Authentication headers are handled separately and automatically.
- `ALLOW_MUTATIONS`: Set to `true` to allow GraphQL mutation operations. Defaults to `false` (mutations disallowed).

**Example `.env` File:**

```dotenv
# --- Authentication ---
# WARNING: Storing sensitive credentials directly in .env is not recommended for production.
# Consider using a secure secret management system.
AUTH_API_ENDPOINT="https://uat-api.purchaseplus.com"
AUTH_EMAIL="your-email@example.com"
AUTH_PASSWORD="your-secure-password"

# --- GraphQL Tool Config (Optional) ---
ENDPOINT="https://uat-purchaseplus.com/graphql"
TIMEOUT=30000
MAX_DEPTH=100
# HEADERS='{}'
# ALLOW_MUTATIONS=false # Defaults to false if not present
```

## Authentication Flow

1.  When a GraphQL tool (`graphql_query` or `graphql_introspect`) is called, the server checks for a valid, non-expired authentication token in its local cache.
2.  If a valid cached token exists (with a 15-minute buffer before expiry), it's used to construct the necessary authentication headers (`Authorization: Bearer ...`, `access-token`, `client`, `uid`, `expiry`).
3.  If no valid token is cached, the server uses the `AUTH_EMAIL` and `AUTH_PASSWORD` from `.env` to authenticate against the `AUTH_API_ENDPOINT` (specifically the `/access/api/auth/sign_in` path).
4.  Authentication attempts are retried automatically on transient errors.
5.  If authentication is successful, the server extracts the required token details (`access-token`, `client`, `uid`, `expiry`) from the response headers.
6.  The new token is cached locally, and the authentication headers are constructed.
7.  The final GraphQL request (query or introspection) is sent to the target `ENDPOINT` with the merged headers (default headers < request-specific headers < authentication headers).

## Installation & Setup

1.  **Clone the repository (if not already done):**
    ```bash
    git clone <repository-url>
    cd mcp-graphql-tools
    ```
2.  **Install dependencies:**
    ```bash
    yarn install
    ```
3.  **Create and configure `.env`:**
    Create a `.env` file in the project root and add the required `AUTH_API_ENDPOINT`, `AUTH_EMAIL`, `AUTH_PASSWORD`, and any optional variables.
4.  **Build the project:**
    ```bash
    yarn build
    ```
    This compiles the TypeScript code into JavaScript in the `./dist` directory.

## Running the Server

You can run the server directly for testing:

```bash
node ./dist/index.js
```

## Usage with Cursor MCP

To integrate this tool with Cursor's Model Context Protocol:

1.  Ensure you have completed the Installation & Setup steps above.
2.  Open your Cursor MCP configuration file (often `~/.cursor/mcp.json`).
3.  Add or modify the entry for your GraphQL server to execute the compiled code directly using `node` from the project's directory.

**Example `mcp.json` Configuration:**

```json
{
  "mcpServers": {
    "graphql": {
      "command": "node",
      "args": [
        // Replace with the *absolute path* to your project's dist/index.js
        "/Users/shaynes/Code/mcp-graphql-tools/dist/index.js"
      ],
      // Optional: Specify the working directory if needed,
      // otherwise it defaults to where Cursor is run from.
      "options": {
        "cwd": "/Users/shaynes/Code/mcp-graphql-tools"
      }
    }
    // ... other servers
  }
}
```

**Important Notes for `mcp.json`:**

- Use the **absolute path** to `dist/index.js` for reliability.
- Specifying the `cwd` (current working directory) in the `options` ensures that the server correctly finds the `.env` file in the project root when run via Cursor.
- **Do not** pass `--endpoint`, `--headers`, or authentication arguments here; rely on the `.env` file.

## Available Tools

Once configured in Cursor, the following tools become available:

- **`graphql_query`**

  - Description: Execute GraphQL queries using either a specified endpoint or the default endpoint configured during installation.
  - Arguments:
    - `query` (string, **required**): The GraphQL query to execute.
    - `variables` (object, optional): Variables for the query (JSON object).
    - `endpoint` (string, optional): Override the default GraphQL endpoint URL.
    - `headers` (object, optional): Additional _non-authentication_ headers for the request (will be merged with default and auth headers).
    - `timeout` (number, optional): Override the default request timeout in milliseconds.

- **`graphql_introspect`**
  - Description: Introspect a GraphQL schema from an endpoint with configurable headers.
  - Arguments:
    - `endpoint` (string, optional): Override the default GraphQL endpoint URL.
    - `headers` (object, optional): Additional _non-authentication_ headers for the request (will be merged with default and auth headers).
    - `includeDeprecated` (boolean, optional): Whether to include deprecated fields (default: `true`).

## License

This MCP server is licensed under the MIT License. See the LICENSE file for details.
