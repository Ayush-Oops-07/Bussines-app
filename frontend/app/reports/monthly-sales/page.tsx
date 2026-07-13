"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "../../../components/layout/MainLayout";
import { reportService, MonthlySalesInvoice } from "../../../services/report-service";
import { useAuthStore } from "../../../store/auth-store";
import { Calendar, FileSpreadsheet, FileDown, Printer, RefreshCw } from "lucide-react";
import clsx from "clsx";

export default function MonthlySalesReportPage() {
  const [filterMode, setFilterMode] = useState<"month" | "date">("month");
  
  // Month/Year states
  const today = new Date();
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [year, setYear] = useState<number>(today.getFullYear());
  
  // Date Range states
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  
  // Trigger state to manually fetch
  const [queryParams, setQueryParams] = useState<any>({
    month: today.getMonth() + 1,
    year: today.getFullYear(),
  });

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["monthly-sales-report", queryParams],
    queryFn: () => reportService.getMonthlySales(queryParams),
  });

  const handleGenerate = () => {
    if (filterMode === "month") {
      setQueryParams({ month, year });
    } else {
      if (!fromDate || !toDate) {
        alert("Please select both From and To dates.");
        return;
      }
      setQueryParams({ from: fromDate, to: toDate });
    }
  };

  const handleDownload = async (format: "pdf" | "excel") => {
    const token = useAuthStore.getState().token;
    
    // Build query params
    const searchParams = new URLSearchParams();
    if (queryParams.month) searchParams.append("month", String(queryParams.month));
    if (queryParams.year) searchParams.append("year", String(queryParams.year));
    if (queryParams.from) searchParams.append("from", queryParams.from);
    if (queryParams.to) searchParams.append("to", queryParams.to);
    
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "/api/backend";
    const endpoint = format === "pdf" ? "/api/reports/monthly-sales/pdf" : "/api/reports/monthly-sales/excel";
    const downloadUrl = `${apiBase}${endpoint}?${searchParams.toString()}`;
    const filename = format === "pdf" 
      ? `monthly_sales_report_${queryParams.year || ""}_${queryParams.month || "range"}.pdf`
      : `monthly_sales_report_${queryParams.year || ""}_${queryParams.month || "range"}.xlsx`;

    try {
      const response = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) throw new Error("Failed to export report");
      
      const blob = await response.blob();
      const fileUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = fileUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(fileUrl);
    } catch (err: any) {
      alert("Export failed: " + err.message);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    });
  };

  const monthsList = [
    { value: 1, label: "January" },
    { value: 2, label: "February" },
    { value: 3, label: "March" },
    { value: 4, label: "April" },
    { value: 5, label: "May" },
    { value: 6, label: "June" },
    { value: 7, label: "July" },
    { value: 8, label: "August" },
    { value: 9, label: "September" },
    { value: 10, label: "October" },
    { value: 11, label: "November" },
    { value: 12, label: "December" },
  ];

  // Years from 2020 to current + 4
  const startYr = 2020;
  const endYr = today.getFullYear() + 4;
  const yearsList = [];
  for (let y = endYr; y >= startYr; y--) {
    yearsList.push(y);
  }

  const invoices = data?.invoices || [];

  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Page Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 no-print">
          <div>
            <h1 className="text-xl font-extrabold text-foreground tracking-wider uppercase">
              Monthly Sales Report
            </h1>
            <p className="text-xs text-textMuted mt-1">
              Analyze monthly sales invoices, payment collection status, and customer outstandings.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleDownload("pdf")}
              disabled={invoices.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red hover:bg-red/90 text-white font-bold text-xs cursor-pointer transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown size={14} />
              <span>Download PDF</span>
            </button>
            <button
              onClick={() => handleDownload("excel")}
              disabled={invoices.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green hover:bg-green/90 text-white font-bold text-xs cursor-pointer transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileSpreadsheet size={14} />
              <span>Download Excel</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={invoices.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-bg2 hover:bg-white/5 text-textMuted hover:text-foreground font-bold text-xs cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer size={14} />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* Print Only Title */}
        <div className="hidden print-only mb-6 p-4 border-b border-black text-black">
          <div className="text-center font-bold text-2xl uppercase tracking-wider">
            SANDEEP TRADERS — SALES REPORT
          </div>
          <div className="text-center text-xs mt-1">Pakhopali Road, Thawe, Gopalganj</div>
          <div className="flex justify-between mt-6 text-sm">
            <div>
              <strong>Report Type:</strong> Monthly Sales Report
            </div>
            <div className="text-right">
              <strong>Period:</strong> {data?.from_date} to {data?.to_date}
            </div>
          </div>
        </div>

        {/* Filters Controls */}
        <div className="flex flex-wrap gap-4 items-end bg-card p-4 rounded-xl border border-white/5 no-print shadow-sm">
          {/* Mode Switcher */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Filter Mode</label>
            <div className="grid grid-cols-2 p-0.5 rounded-lg bg-bg2 border border-white/5 w-48">
              <button
                onClick={() => setFilterMode("month")}
                className={clsx(
                  "py-1 rounded-md text-[10px] font-bold text-center cursor-pointer transition-colors",
                  filterMode === "month" ? "bg-blue text-white" : "text-textMuted hover:text-foreground"
                )}
              >
                Month & Year
              </button>
              <button
                onClick={() => setFilterMode("date")}
                className={clsx(
                  "py-1 rounded-md text-[10px] font-bold text-center cursor-pointer transition-colors",
                  filterMode === "date" ? "bg-blue text-white" : "text-textMuted hover:text-foreground"
                )}
              >
                Date Range
              </button>
            </div>
          </div>

          {filterMode === "month" ? (
            <>
              {/* Month Dropdown */}
              <div className="flex flex-col gap-1.5 w-40">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Select Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-semibold"
                >
                  {monthsList.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year Dropdown */}
              <div className="flex flex-col gap-1.5 w-32">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">Select Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full h-[46px] px-3 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all cursor-pointer font-semibold"
                >
                  {yearsList.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              {/* From Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">From Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                  />
                </div>
              </div>

              {/* To Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-textMuted uppercase tracking-wider">To Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="h-[46px] pl-10 pr-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-[#111827] dark:text-[#f8fafc] outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium"
                  />
                </div>
              </div>
            </>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={isFetching}
            className="flex items-center gap-2 h-[46px] px-6 rounded-[12px] bg-gradient-to-r from-blue to-blue/90 hover:from-blue/95 hover:to-blue/85 text-white font-bold text-sm transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            {isFetching ? <RefreshCw size={14} className="animate-spin" /> : null}
            <span>Generate Report</span>
          </button>
        </div>

        {/* Sales report summary statistics block */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-bg2/40 border border-white/5 p-4 rounded-xl print:text-black print:border-black">
            <div className="flex flex-col gap-1 text-center md:text-left">
              <span className="text-[10px] text-textMuted uppercase font-bold print:text-black">
                Total Sales
              </span>
              <span className="text-lg font-extrabold text-appAmber print:text-black">
                {formatCurrency(data.total_sales)}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-center md:text-left">
              <span className="text-[10px] text-textMuted uppercase font-bold print:text-black">
                Total Paid
              </span>
              <span className="text-lg font-extrabold text-appGreen print:text-black">
                {formatCurrency(data.total_paid)}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-center md:text-left">
              <span className="text-[10px] text-textMuted uppercase font-bold print:text-black">
                Total Outstanding
              </span>
              <span className="text-lg font-extrabold text-appRed print:text-black">
                {formatCurrency(data.total_outstanding)}
              </span>
            </div>
            <div className="flex flex-col gap-1 text-center md:text-left">
              <span className="text-[10px] text-textMuted uppercase font-bold print:text-black">
                Number of Invoices
              </span>
              <span className="text-lg font-extrabold text-blue print:text-black">
                {data.num_invoices}
              </span>
            </div>
          </div>
        )}

        {/* Report Table */}
        <div className="rounded-xl border border-white/5 bg-card overflow-hidden print:border-black">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left print:text-black">
              <thead>
                <tr className="border-b border-white/5 bg-bg2/40 text-textMuted font-bold uppercase tracking-wider print:bg-gray-100 print:text-black print:border-black">
                  <th className="px-4 py-3">Invoice No</th>
                  <th className="px-4 py-3">Invoice Date</th>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3 text-right">Total Amount</th>
                  <th className="px-4 py-3 text-center">Payment Status</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 print:divide-black">
                {invoices.map((inv: MonthlySalesInvoice) => (
                  <tr key={inv.invoice_number} className="hover:bg-white/2 print:hover:bg-transparent">
                    <td className="px-4 py-3 font-semibold">{inv.invoice_number}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{inv.invoice_date}</td>
                    <td className="px-4 py-3 font-medium">{inv.customer_name}</td>
                    <td className="px-4 py-3 text-textMuted print:text-black">{inv.mobile || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatCurrency(inv.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span
                        className={clsx(
                          "inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                          inv.payment_status === "Paid"
                            ? "bg-appGreen/15 text-appGreen"
                            : inv.payment_status === "Partially Paid"
                            ? "bg-appAmber/15 text-appAmber"
                            : "bg-appRed/15 text-appRed"
                        )}
                      >
                        {inv.payment_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold">
                      {formatCurrency(inv.outstanding)}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-textMuted print:text-black">
                      {isLoading ? "Loading sales report data..." : "No invoices found for the selected period."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
