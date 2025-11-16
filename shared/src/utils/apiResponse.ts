export class ApiResponse<T = unknown> {
  statusCode: number;
  data: T | null;
  message: string;
  success: boolean;

  constructor(statusCode = 200, data: T | null = null, message = "Successful") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}

export function waitingResponse(message = "No data available yet"): ApiResponse<{ status: "waiting"; message: string }> {
  return new ApiResponse(200, { status: "waiting", message }, message);
}
