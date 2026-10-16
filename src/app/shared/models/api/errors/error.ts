export interface ApiErrorResponse {
    timestamp: string;
    status: number;
    error: string;
    message: string;
    details?: Record<string, string>;
}