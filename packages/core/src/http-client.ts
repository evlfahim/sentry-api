import axios, {
  AxiosRequestConfig,
  AxiosResponse,
  AxiosError,
  AxiosInstance,
} from "axios";

export interface RequestOptions {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface Response {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: unknown;
  duration: number;
  request: RequestOptions;
}

export interface ErrorResponse {
  error: string;
  request?: RequestOptions;
  details?: unknown;
}

/**
 * Sends an HTTP request and returns the response.
 */
export async function sendRequest(
  options: RequestOptions
): Promise<Response | ErrorResponse> {
  const startTime = Date.now();

  try {
    const config: AxiosRequestConfig = {
      method: options.method.toLowerCase(),
      url: options.url,
      headers: options.headers,
      params: options.query,
      data: options.body,
      timeout: options.timeout ?? 30000,
      validateStatus: () => true, // Accept all status codes
      maxRedirects: 5,
    };

    const axiosInstance: AxiosInstance = axios.create({
      timeout: config.timeout,
      maxRedirects: config.maxRedirects,
    });

    const axiosResponse: AxiosResponse = await axiosInstance.request(config);

    const duration = Date.now() - startTime;

    // Convert headers from axios format (lowercase keys) to a plain object
    const headers: Record<string, string> = {};
    if (axiosResponse.headers) {
      for (const [key, value] of Object.entries(axiosResponse.headers)) {
        if (typeof value === "string") {
          headers[key] = value;
        } else if (Array.isArray(value)) {
          headers[key] = value.join(", ");
        }
      }
    }

    return {
      status: axiosResponse.status,
      statusText: axiosResponse.statusText,
      headers,
      data: axiosResponse.data,
      duration,
      request: options,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      const resp = axiosError.response;
      const headers: Record<string, string> = {};
      if (resp.headers) {
        for (const [key, value] of Object.entries(resp.headers)) {
          if (typeof value === "string") {
            headers[key] = value;
          } else if (Array.isArray(value)) {
            headers[key] = value.join(", ");
          }
        }
      }
      return {
        error: axiosError.message,
        request: options,
        details: {
          status: resp.status,
          statusText: resp.statusText,
          headers,
          data: resp.data,
          duration,
        },
      };
    }

    if (axiosError.code === "ECONNABORTED" || axiosError.message.includes("timeout")) {
      return {
        error: "Request timeout",
        request: options,
        details: { duration },
      };
    }

    return {
      error: axiosError.message || "Unknown error",
      request: options,
      details: { duration },
    };
  }
}
