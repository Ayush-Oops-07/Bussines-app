import { apiClient } from "./api-client";
import { DashboardData, PartyType } from "../types";

export const dashboardService = {
  getDashboard: async (type: PartyType, year: number): Promise<DashboardData> => {
    return apiClient<DashboardData>("/api/dashboard/", {
      params: { type, year },
    });
  },
};
