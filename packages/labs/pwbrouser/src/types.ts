export interface Target {
  ref?: string;
  role?: string;
  name?: string;
  selector?: string;
}

export interface Field {
  target: Target;
  value: string;
}

export interface ExecuteRequest {
  method: string;
  params?: Record<string, unknown>;
}

export interface ExecuteResponse {
  result?: unknown;
  error?: {
    message: string;
    snapshot?: string;
  };
}

export interface MutatingResult {
  snapshot: string;
  url: string;
}

export interface ConsoleMessageEntry {
  type: string;
  text: string;
  timestamp: number;
}

export interface NetworkRequestEntry {
  index: number;
  url: string;
  method: string;
  status: number;
  statusText: string;
  type: string;
  _request: unknown;
  _response: unknown;
}
