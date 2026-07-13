import { apiClient } from "./api-client";
import { User } from "../types";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export const authService = {
  login: async (username: string, password_hash: string): Promise<LoginResponse> => {
    return apiClient<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password: password_hash }),
    });
  },

  changePassword: async (old_password: string, new_password: string): Promise<{ ok: boolean }> => {
    return apiClient<{ ok: boolean }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ old_password, new_password }),
    });
  },
};
