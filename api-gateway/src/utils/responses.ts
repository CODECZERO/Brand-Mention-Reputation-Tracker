export interface WaitingResponse {
  status: "waiting";
  message: string;
}

export interface ErrorResponse {
  status: "error";
  message: string;
}

export function waiting(message: string): WaitingResponse {
  return { status: "waiting", message };
}

export function error(message: string): ErrorResponse {
  return { status: "error", message };
}
