import { User } from "../../user";

export interface AuthResponse {
  access_token?: string;
  refresh_token?: string | null;
  token_type?: string;
  expires_in?: number;
  accessToken?: string;
  refreshToken?: string | null;
  tokenType?: string;
  expiresIn?: number;
  user: User;
}
