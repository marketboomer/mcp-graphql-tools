import axios, { type AxiosResponse } from "axios";
import retry from "async-retry";
import { config } from "./config.js";

// Define the structure of the token object based on the Python example
interface ApiToken {
  "access-token": string;
  client: string;
  expiry: string; // Keep as string initially, parse to number for comparison
  uid: string;
  "token-type": string;
}

// Define the structure for the headers used in GraphQL requests
interface AuthHeaders {
  Accept: string;
  Authorization: string;
  "access-token": string;
  "token-type": string;
  client: string;
  expiry: string;
  uid: string;
}

// Global cache variables
let cachedToken: AuthHeaders | null = null;
let cachedTokenExpiry: number | null = null;

class ApiTokenManager {
  private async api_post(
    email: string,
    password: string
  ): Promise<AxiosResponse> {
    console.error("Attempting authentication via POST...");
    return axios.post(
      `${config.authEndpoint}/access/api/auth/sign_in`, // Make sure this path is correct for your auth API
      { email, password },
      {
        headers: { Accept: "application/vnd.mbapi.v2+json" }, // Use appropriate Accept header
        // Consider adding timeout and disabling SSL verification if needed (like `verify=False`)
        // timeout: config.timeout, // You might want a separate auth timeout
        // httpsAgent: new https.Agent({ rejectUnauthorized: false }) // If needed for self-signed certs
      }
    );
  }

  private api_credentials(response: AxiosResponse): ApiToken {
    console.error("Extracting credentials from response headers...");
    // Important: Header names might be case-insensitive or normalized by axios/http
    // Check the actual response headers if issues arise.
    const headers = response.headers;
    const token: ApiToken = {
      "access-token": headers["access-token"] || headers["Access-Token"],
      client: headers["client"] || headers["Client"],
      expiry: headers["expiry"] || headers["Expiry"],
      uid: headers["uid"] || headers["Uid"],
      "token-type": "Bearer", // Assuming Bearer based on Python code
    };

    // Basic validation
    if (
      !token["access-token"] ||
      !token.client ||
      !token.expiry ||
      !token.uid
    ) {
      console.error("Auth Response Headers:", headers); // Log headers for debugging
      throw new Error(
        "Authentication successful, but required headers (access-token, client, expiry, uid) were missing in the response."
      );
    }
    return token;
  }

  private async api_auth(email: string, password: string): Promise<ApiToken> {
    console.error("Performing API authentication...");
    const request = await this.api_post(email, password);

    if (request.status >= 200 && request.status < 300) {
      console.error("Authentication POST successful.");
      return this.api_credentials(request);
    }

    // Add a small delay before retry if 409 conflict occurs, similar to Python code
    if (request.status === 409) {
      console.error(
        "Authentication returned 409 Conflict, waiting before retry..."
      );
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 second delay
      const retryRequest = await this.api_post(email, password);
      if (retryRequest.status >= 200 && retryRequest.status < 300) {
        console.error("Retry Authentication POST successful.");
        return this.api_credentials(retryRequest);
      }
    }

    // Throw error if auth failed after potential retry
    console.error(
      `Authentication failed. Status: ${request.status}, Body: ${JSON.stringify(
        request.data
      )}`
    );
    throw new Error(
      `Failed to authenticate user. Status: ${
        request.status
      }, Response: ${JSON.stringify(request.data)}`
    );
  }

  // Method to retrieve the token, handling caching and renewal
  public async getToken(): Promise<AuthHeaders> {
    console.error("getToken called...");
    const currentTime = Math.floor(Date.now() / 1000); // Use seconds for expiry comparison

    // Check cache validity (15-minute buffer)
    if (
      cachedToken &&
      cachedTokenExpiry &&
      currentTime < cachedTokenExpiry - 900
    ) {
      console.error("Returning valid cached token.");
      return cachedToken;
    }

    console.error("Cached token invalid or expired, fetching new token...");

    try {
      // Use retry logic for fetching the token
      const newTokenInfo = await retry(
        async (bail) => {
          try {
            return await this.api_auth(config.authEmail, config.authPassword);
          } catch (error: any) {
            // Don't retry on certain errors (e.g., invalid credentials)
            if (
              error.response &&
              (error.response.status === 401 || error.response.status === 403)
            ) {
              console.error(
                "Authentication failed with non-retriable status:",
                error.response.status
              );
              bail(new Error(`Authentication failed: ${error.message}`));
              return; // Required to satisfy TypeScript
            } else if (
              error instanceof Error &&
              error.message.includes("required headers")
            ) {
              // Don't retry if headers are missing
              console.error("Authentication failed due to missing headers");
              bail(error);
              return;
            }
            console.error(
              "Retrying authentication due to error:",
              error.message
            );
            throw error; // Throw error to trigger retry
          }
        },
        {
          retries: 2, // Total 3 attempts (initial + 2 retries)
          factor: 2,
          minTimeout: 1000,
          maxTimeout: 5000,
          onRetry: (error, attempt) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            console.error(
              `Authentication attempt ${attempt} failed: ${errorMessage}`
            );
          },
        }
      );

      if (!newTokenInfo) {
        throw new Error(
          "Authentication failed: newTokenInfo is undefined after retry."
        );
      }

      console.error("New token retrieved successfully.");

      // Format token into the AuthHeaders structure for caching and use
      const newAuthHeaders: AuthHeaders = {
        Accept: "application/json", // Default Accept for GraphQL
        Authorization: `Bearer ${newTokenInfo["access-token"]}`,
        "access-token": newTokenInfo["access-token"],
        "token-type": "Bearer",
        client: newTokenInfo.client,
        expiry: newTokenInfo.expiry,
        uid: newTokenInfo.uid,
      };

      // Cache the new token and expiry
      cachedToken = newAuthHeaders;
      try {
        cachedTokenExpiry = parseInt(newTokenInfo.expiry, 10);
        if (isNaN(cachedTokenExpiry)) {
          throw new Error("Expiry value is not a number");
        }
        console.error(
          `Token cached. Expires at (timestamp): ${cachedTokenExpiry}`
        );
      } catch (e) {
        console.error(
          `Warning: Could not parse token expiry ('${newTokenInfo.expiry}'): ${
            e instanceof Error ? e.message : String(e)
          }. Setting default 1hr expiry.`
        );
        // Set a default expiry time (1 hour from now) if parsing fails
        cachedTokenExpiry = currentTime + 3600;
      }

      return newAuthHeaders;
    } catch (error) {
      console.error(
        `FATAL: Failed to retrieve API token after all retries: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      // Depending on requirements, you might want to exit or throw a more specific error
      throw new Error(
        `Failed to retrieve API token: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

// Export a singleton instance
export const apiTokenManager = new ApiTokenManager();
