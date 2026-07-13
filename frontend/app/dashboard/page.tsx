"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "../../store/ui-store";
import { dashboardService } from "../../services/dashboard-service";
import { customerService } from "../../services/customer-service";
import { paymentService } from "../../services/payment-service";
import MainLayout from "../../components/layout/MainLayout";
import { useRouter } from "next/navigation";
import {
  Users,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  RotateCcw,
  X,
  Plus,
  Minus,
  ArrowDown,
  ArrowUp,
  FileText,
  ShoppingCart,
  Briefcase,
  Calendar,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import CustomerSearchCombobox from "../../components/ui/CustomerSearchCombobox";

export default function DashboardPage() {
  const activeModule = useUIStore((s) => s.activeModule);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", activeModule, year],
    queryFn: () => dashboardService.getDashboard(activeModule, year),
    refetchInterval: 10000, // auto-refresh metrics every 10 seconds
  });

  // Quick Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentType, setPaymentType] = useState<"RECEIVED" | "GIVEN">("RECEIVED");

  // Form fields state
  const [selectedPartyId, setSelectedPartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [txnDate, setTxnDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [paymentMode, setPaymentMode] = useState("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  // Fetch parties lookup for modal
  const { data: partiesList = [] } = useQuery({
    queryKey: ["parties-lookup-dashboard", activeModule, isPaymentModalOpen],
    queryFn: () => customerService.list(activeModule, ""),
    enabled: isPaymentModalOpen,
  });

  const addPaymentMutation = useMutation({
    mutationFn: (payload: any) => paymentService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      closePaymentModal();
    },
    onError: (err: any) => {
      setFormError(err.message || "Something went wrong");
    }
  });

  const openPaymentModal = (type: "RECEIVED" | "GIVEN") => {
    setPaymentType(type);
    setSelectedPartyId("");
    setAmount("");
    setTxnDate(new Date().toISOString().split("T")[0]);
    setPaymentMode("cash");
    setReferenceNo("");
    setNotes("");
    setFormError("");
    setIsPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsPaymentModalOpen(false);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPartyId) {
      setFormError("Please select a customer / shoper");
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setFormError("Amount must be greater than 0");
      return;
    }
    addPaymentMutation.mutate({
      customer_id: selectedPartyId,
      payment_type: paymentType,
      amount: amt,
      payment_mode: paymentMode,
      reference_no: referenceNo,
      note: notes,
      transaction_date: txnDate,
    });
  };

  const years = [year - 2, year - 1, year, year + 1];

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(val);
  };

  if (error) {
    return (
      <MainLayout>
        <div className="flex h-[50vh] flex-col items-center justify-center text-center">
          <div className="text-destructive text-lg mb-2">Error loading dashboard</div>
          <p className="text-textMuted text-sm">{(error as Error).message}</p>
        </div>
      </MainLayout>
    );
  }

  const kpi = data?.kpi || {
    total_parties: 0,
    pending_count: 0,
    advance_count: 0,
    clear_count: 0,
    total_pending: 0,
    total_advance: 0,
    net_outstanding: 0,
    today_sales: 0,
    today_collections: 0,
    today_returns: 0,
    total_returns: 0,
    today_cash_received: 0,
    today_cash_given: 0,
    net_collections: 0,
    total_invoices_count: 0,
    total_returns_count: 0,
    total_payments_received_count: 0,
    total_payments_given_count: 0,
    today_sales_count: 0,
    today_collections_count: 0,
  };

  const chartData = data?.charts || {
    months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    sales: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    returns: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    collections: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    payments_given: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  };

  const topPending = data?.top_pending || [];
  const recentTransactions = data?.recent_transactions || [];

  const getScaleTicks = (maxVal: number) => {
    if (maxVal <= 0) return [1, 0.75, 0.5, 0.25, 0];
    const digits = Math.floor(Math.log10(maxVal));
    const base = Math.pow(10, digits);
    let roundMax = Math.ceil(maxVal / base) * base;
    if (roundMax / 2 > maxVal) roundMax = roundMax / 2;
    return [roundMax, roundMax * 0.75, roundMax * 0.5, roundMax * 0.25, 0];
  };

  const formatTick = (val: number) => {
    if (val === 0) return "₹0";
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`;
    return `₹${val}`;
  };

  // Line chart SVG
  const SVGLineChart = ({
    sales,
    returns,
    months,
  }: {
    sales: number[];
    returns: number[];
    months: string[];
  }) => {
    const maxVal = Math.max(...sales, ...returns, 1);
    const ticks = getScaleTicks(maxVal);
    const limit = ticks[0];

    const width = 500;
    const height = 150;
    const paddingLeft = 45;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const getX = (index: number) => paddingLeft + (index / 11) * chartWidth;
    const getY = (value: number) => {
      const ratio = limit > 0 ? value / limit : 0;
      return height - paddingBottom - ratio * chartHeight;
    };

    const makePath = (data: number[]) => {
      if (data.length === 0) return "";
      return data
        .map((val, idx) => `${idx === 0 ? "M" : "L"} ${getX(idx)} ${getY(val)}`)
        .join(" ");
    };

    const salesPath = makePath(sales);
    const returnsPath = makePath(returns);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-textMuted select-none overflow-visible">
        {/* Horizontal grid lines */}
        {ticks.map((tick, idx) => {
          const y = getY(tick);
          return (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                className="stroke-border"
                strokeOpacity={0.4}
                strokeWidth={1}
                strokeDasharray="2,2"
              />
              <text
                x={paddingLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-textMuted text-[8px] font-bold"
              >
                {formatTick(tick)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {months.map((m, idx) => (
          <text
            key={idx}
            x={getX(idx)}
            y={height - 8}
            textAnchor="middle"
            className="fill-textMuted text-[8px] font-bold"
          >
            {m}
          </text>
        ))}

        {/* Sales Path */}
        {salesPath && (
          <path
            d={salesPath}
            fill="none"
            stroke="#2563EB"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Returns Path */}
        {returnsPath && (
          <path
            d={returnsPath}
            fill="none"
            stroke="#EF4444"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Sales dots */}
        {sales.map((val, idx) => (
          <circle
            key={`s-${idx}`}
            cx={getX(idx)}
            cy={getY(val)}
            r={2.5}
            className="fill-white stroke-blue stroke-[1.5]"
          />
        ))}

        {/* Returns dots */}
        {returns.map((val, idx) => (
          <circle
            key={`r-${idx}`}
            cx={getX(idx)}
            cy={getY(val)}
            r={2.5}
            className="fill-white stroke-red stroke-[1.5]"
          />
        ))}
      </svg>
    );
  };

  // Bar chart SVG
  const SVGDoubleBarChart = ({
    collections,
    paymentsGiven,
    months,
  }: {
    collections: number[];
    paymentsGiven: number[];
    months: string[];
  }) => {
    const maxVal = Math.max(...collections, ...paymentsGiven, 1);
    const ticks = getScaleTicks(maxVal);
    const limit = ticks[0];

    const width = 500;
    const height = 150;
    const paddingLeft = 45;
    const paddingRight = 10;
    const paddingTop = 15;
    const paddingBottom = 25;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const getX = (index: number) => paddingLeft + (index / 11) * chartWidth;
    const getY = (value: number) => {
      const ratio = limit > 0 ? value / limit : 0;
      return height - paddingBottom - ratio * chartHeight;
    };

    const groupWidth = (chartWidth / 12) * 0.75;
    const barWidth = groupWidth * 0.45;
    const gap = 1;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full text-textMuted select-none overflow-visible">
        {/* Horizontal grid lines */}
        {ticks.map((tick, idx) => {
          const y = getY(tick);
          return (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width - paddingRight}
                y2={y}
                className="stroke-border"
                strokeOpacity={0.4}
                strokeWidth={1}
                strokeDasharray="2,2"
              />
              <text
                x={paddingLeft - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-textMuted text-[8px] font-bold"
              >
                {formatTick(tick)}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {months.map((m, idx) => (
          <text
            key={idx}
            x={getX(idx)}
            y={height - 8}
            textAnchor="middle"
            className="fill-textMuted text-[8px] font-bold"
          >
            {m}
          </text>
        ))}

        {/* Double Bars */}
        {months.map((_, idx) => {
          const collVal = collections[idx] || 0;
          const payVal = paymentsGiven[idx] || 0;

          const xCenter = getX(idx);
          const xColl = xCenter - barWidth - gap / 2;
          const xPay = xCenter + gap / 2;

          const yColl = getY(collVal);
          const yPay = getY(payVal);

          const hColl = Math.max(0, height - paddingBottom - yColl);
          const hPay = Math.max(0, height - paddingBottom - yPay);

          return (
            <g key={idx}>
              {/* Received (Green) */}
              {collVal > 0 && (
                <rect
                  x={xColl}
                  y={yColl}
                  width={barWidth}
                  height={hColl}
                  rx={1.5}
                  className="fill-green hover:opacity-90 transition-opacity"
                />
              )}
              {/* Given (Red) */}
              {payVal > 0 && (
                <rect
                  x={xPay}
                  y={yPay}
                  width={barWidth}
                  height={hPay}
                  rx={1.5}
                  className="fill-red hover:opacity-90 transition-opacity"
                />
              )}
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Floating Year Selector aligned to right */}
        <div className="flex justify-end pr-1 no-print">
          <div className="relative flex items-center bg-card border border-border px-3 py-1.5 rounded-lg shadow-sm text-xs font-bold gap-2">
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-transparent border-none font-bold outline-none cursor-pointer text-foreground pr-6 appearance-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Calendar size={14} className="text-textMuted pointer-events-none absolute right-3" />
          </div>
        </div>

        {/* Quick actions panel (Top Row) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 no-print">
          {/* Card 1: Payment Received */}
          <div
            onClick={() => openPaymentModal("RECEIVED")}
            className="flex items-center gap-4 p-6 rounded-[18px] border border-[#DCFCE7] bg-[#F0FDF4] shadow-sm cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all duration-200"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-green/30 bg-white text-green shadow-sm">
              <ArrowDown size={20} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-green">Payment Received</h3>
              <p className="text-[11px] text-textMuted mt-0.5">Receive money from customer</p>
            </div>
          </div>

          {/* Card 2: Payment Given */}
          <div
            onClick={() => openPaymentModal("GIVEN")}
            className="flex items-center gap-4 p-6 rounded-[18px] border border-[#FEE2E2] bg-[#FEF2F2] shadow-sm cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all duration-200"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red/30 bg-white text-red shadow-sm">
              <ArrowUp size={20} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-red">Payment Given</h3>
              <p className="text-[11px] text-textMuted mt-0.5">Make payment to customer</p>
            </div>
          </div>

          {/* Card 3: New Sale Invoice */}
          <div
            onClick={() => router.push("/invoices?new=true")}
            className="flex items-center gap-4 p-6 rounded-[18px] border border-[#DBEAFE] bg-[#EFF6FF] shadow-sm cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all duration-200"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue/30 bg-white text-blue shadow-sm">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-blue">New Sale Invoice</h3>
              <p className="text-[11px] text-textMuted mt-0.5">Create new invoice</p>
            </div>
          </div>

          {/* Card 4: New Purchase Return */}
          <div
            onClick={() => router.push("/purchase-returns?new=true")}
            className="flex items-center gap-4 p-6 rounded-[18px] border border-[#EDE9FE] bg-[#F5F3FF] shadow-sm cursor-pointer hover:scale-[1.02] hover:shadow-md transition-all duration-200"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-violet/30 bg-white text-violet shadow-sm">
              <RotateCcw size={20} />
            </div>
            <div>
              <h3 className="text-[15px] font-bold text-violet">New Purchase Return</h3>
              <p className="text-[11px] text-textMuted mt-0.5">Create new return</p>
            </div>
          </div>
        </div>

        {/* Summary Cards Row (Second Row) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
          {/* Card 1: Today's Sales */}
          <div className="rounded-[18px] border border-border bg-card p-6 flex flex-col justify-between shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">Today's Sales</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue/10 text-blue shadow-sm">
                <ShoppingCart size={18} />
              </div>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight leading-none truncate" title={formatCurrency(kpi.today_sales)}>
                {formatCurrency(kpi.today_sales)}
              </h2>
              <p className="text-[11px] font-semibold text-textMuted mt-1.5">
                {kpi.today_sales_count || 0} Invoices
              </p>
            </div>
          </div>

          {/* Card 2: Today's Collection */}
          <div className="rounded-[18px] border border-border bg-card p-6 flex flex-col justify-between shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">Today's Collection</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green/10 text-green shadow-sm">
                <CreditCard size={18} />
              </div>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight leading-none truncate" title={formatCurrency(kpi.today_collections)}>
                {formatCurrency(kpi.today_collections)}
              </h2>
              <p className="text-[11px] font-semibold text-textMuted mt-1.5">
                {kpi.today_collections_count || 0} Payments
              </p>
            </div>
          </div>

          {/* Card 3: Total Outstanding */}
          <div className="rounded-[18px] border border-border bg-card p-6 flex flex-col justify-between shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">Outstanding</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red/10 text-red shadow-sm">
                <Users size={18} />
              </div>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight leading-none truncate" title={formatCurrency(kpi.total_pending)}>
                {formatCurrency(kpi.total_pending)}
              </h2>
              <p className="text-[11px] font-semibold text-textMuted mt-1.5">
                From {kpi.pending_count || 0} Parties
              </p>
            </div>
          </div>

          {/* Card 4: Total Advance */}
          <div className="rounded-[18px] border border-border bg-card p-6 flex flex-col justify-between shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">Advance</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet/10 text-violet shadow-sm">
                <Briefcase size={18} />
              </div>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight leading-none truncate" title={formatCurrency(kpi.total_advance)}>
                {formatCurrency(kpi.total_advance)}
              </h2>
              <p className="text-[11px] font-semibold text-textMuted mt-1.5">
                From {kpi.advance_count || 0} Parties
              </p>
            </div>
          </div>

          {/* Card 5: Cash Received */}
          <div className="rounded-[18px] border border-border bg-card p-6 flex flex-col justify-between shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">Cash Received</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green/10 text-green shadow-sm">
                <ArrowDown size={18} />
              </div>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight leading-none truncate" title={formatCurrency(kpi.today_cash_received)}>
                {formatCurrency(kpi.today_cash_received)}
              </h2>
              <p className="text-[11px] font-semibold text-textMuted mt-1.5">Today</p>
            </div>
          </div>

          {/* Card 6: Cash Given */}
          <div className="rounded-[18px] border border-border bg-card p-6 flex flex-col justify-between shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">Cash Given</span>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red/10 text-red shadow-sm">
                <ArrowUp size={18} />
              </div>
            </div>
            <div className="mt-4">
              <h2 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight leading-none truncate" title={formatCurrency(kpi.today_cash_given)}>
                {formatCurrency(kpi.today_cash_given)}
              </h2>
              <p className="text-[11px] font-semibold text-textMuted mt-1.5">Today</p>
            </div>
          </div>
        </div>

        {/* Charts Section (Third Row) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales & Returns Overview */}
          <div className="rounded-[18px] border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[20px] font-bold text-foreground">Sales & Returns Overview</h3>
                <p className="text-[11px] text-textMuted mt-0.5">Monthly sales and return trends</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1.5 text-blue">
                  <span className="h-2 w-2 rounded-full bg-blue"></span> Sales
                </span>
                <span className="flex items-center gap-1.5 text-red">
                  <span className="h-2 w-2 rounded-full bg-red"></span> Returns
                </span>
              </div>
            </div>
            <div className="h-[180px] flex items-end">
              <SVGLineChart sales={chartData.sales} returns={chartData.returns || []} months={chartData.months} />
            </div>
          </div>

          {/* Collections Overview */}
          <div className="rounded-[18px] border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-[20px] font-bold text-foreground">Collections Overview</h3>
                <p className="text-[11px] text-textMuted mt-0.5">Payments received vs payments given</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1.5 text-green">
                  <span className="h-2 w-2 rounded-full bg-green"></span> Payments Received
                </span>
                <span className="flex items-center gap-1.5 text-red">
                  <span className="h-2 w-2 rounded-full bg-red"></span> Payments Given
                </span>
              </div>
            </div>
            <div className="h-[180px] flex items-end">
              <SVGDoubleBarChart collections={chartData.collections} paymentsGiven={chartData.payments_given || []} months={chartData.months} />
            </div>
          </div>
        </div>

        {/* Bottom Section Layout (Tables and Summaries) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Top Outstanding Table (3/12 width or ~25%) */}
          <div className="lg:col-span-3 rounded-[18px] border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                <h3 className="text-[16px] font-bold text-foreground">Top Outstanding</h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-red/10 text-red font-bold">
                  {topPending.length} {topPending.length === 1 ? "Party" : "Parties"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] text-left">
                  <thead>
                    <tr className="border-b border-border text-textMuted font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-2">Party</th>
                      <th className="py-2 text-right">Outstanding (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topPending.map((p: any, idx: number) => (
                      <tr key={p.id || idx} className="odd:bg-transparent even:bg-[#F6F8FC]/50 hover:bg-blue/5 dark:hover:bg-blue/10 transition-colors">
                        <td className="py-3 px-2 font-semibold text-foreground truncate max-w-[120px]">
                          {p.name}
                        </td>
                        <td className="py-3 px-2 text-right font-extrabold text-red">
                          {p.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    {topPending.length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-6 text-center text-textMuted">
                          No outstanding accounts.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <button
              onClick={() => router.push("/customers")}
              className="mt-6 text-xs font-bold text-blue hover:text-blue/80 flex items-center gap-1 cursor-pointer transition-colors border-t border-border pt-4 justify-center"
            >
              <span>View all parties</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Recent Activity Table (6/12 width or ~50%) */}
          <div className="lg:col-span-6 rounded-[18px] border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                <h3 className="text-[16px] font-bold text-foreground">Recent Transactions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px] text-left">
                  <thead>
                    <tr className="border-b border-border text-textMuted font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Particulars</th>
                      <th className="py-2 px-2">Type</th>
                      <th className="py-2 px-2 text-right">Debit (₹)</th>
                      <th className="py-2 px-2 text-right">Credit (₹)</th>
                      <th className="py-2 px-2 text-right">Balance (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentTransactions.map((e: any, idx: number) => {
                      // Color code badges exactly like the reference design
                      let badgeClass = "bg-blue/10 text-blue";
                      let typeLabel = "Invoice";
                      if (e.entry_type === "return") {
                        badgeClass = "bg-violet/10 text-violet";
                        typeLabel = "Return";
                      } else if (e.entry_type === "payment" || e.entry_type === "advance_received" || e.entry_type === "advance_paid") {
                        const isOut = Number(e.debit) > 0;
                        badgeClass = isOut ? "bg-red/10 text-red" : "bg-green/10 text-green";
                        typeLabel = isOut ? "Payment Give" : "Payment Receive";
                      }

                      return (
                        <tr key={e.id || idx} className="odd:bg-transparent even:bg-[#F6F8FC]/50 hover:bg-blue/5 dark:hover:bg-blue/10 transition-colors">
                          <td className="py-3 px-2 text-textMuted whitespace-nowrap text-xs">{e.entry_date}</td>
                          <td className="py-3 px-2 font-semibold text-foreground truncate max-w-[100px]" title={e.particulars}>
                            {e.particulars}
                          </td>
                          <td className="py-3 px-2">
                            <span className={clsx("inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap", badgeClass)}>
                              {typeLabel}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right text-foreground font-semibold">
                            {Number(e.debit) > 0 ? Number(e.debit).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                          </td>
                          <td className="py-3 px-2 text-right text-green font-semibold">
                            {Number(e.credit) > 0 ? Number(e.credit).toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                          </td>
                          <td className="py-3 px-2 text-right text-foreground font-extrabold text-xs whitespace-nowrap">
                            {Number(e.running_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[9px] font-normal text-textMuted">
                              {Number(e.running_balance) >= 0 ? "Dr" : "Cr"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {recentTransactions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-textMuted">
                          No recent transactions.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <button
              onClick={() => router.push("/ledger")}
              className="mt-6 text-xs font-bold text-blue hover:text-blue/80 flex items-center gap-1 cursor-pointer transition-colors border-t border-border pt-4 justify-center"
            >
              <span>View all transactions</span>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Business Summary Card (3/12 width or ~25%) */}
          <div className="lg:col-span-3 rounded-[18px] border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                <h3 className="text-[16px] font-bold text-foreground">Business Summary</h3>
              </div>
              <div className="space-y-4 text-[14px]">
                <div className="flex justify-between items-center py-1">
                  <span className="text-textMuted font-medium">Total Parties</span>
                  <span className="text-foreground font-bold">{kpi.total_parties}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-textMuted font-medium">Total Invoices</span>
                  <span className="text-foreground font-bold">{kpi.total_invoices_count || 0}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-textMuted font-medium">Total Returns</span>
                  <span className="text-foreground font-bold">{kpi.total_returns_count || 0}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-textMuted font-medium">Total Payments Received</span>
                  <span className="text-foreground font-bold">{kpi.total_payments_received_count || 0}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-textMuted font-medium">Total Payments Given</span>
                  <span className="text-foreground font-bold">{kpi.total_payments_given_count || 0}</span>
                </div>
              </div>
            </div>
            <div className="text-[10px] text-textMuted text-center mt-6 border-t border-border pt-4">
              © {year} Sandeep Traders Business Suite. All rights reserved.
            </div>
          </div>
        </div>
      </div>

      {/* Quick Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-[18px] border border-border bg-card p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-5 border-b border-border pb-3">
              <h3 className="text-[16px] font-bold text-foreground flex items-center gap-2">
                <span>{paymentType === "RECEIVED" ? "💵 Payment In (Receive)" : "💸 Payment Out (Pay)"}</span>
              </h3>
              <button
                onClick={closePaymentModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-textMuted hover:bg-[#F6F8FC] cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Party selection dropdown */}
                <div className="space-y-2 col-span-2">
                  <label className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                    Select {activeModule === "customer" ? "Customer" : "Shoper"} *
                  </label>
                  <CustomerSearchCombobox
                    partyType={activeModule}
                    selectedPartyId={selectedPartyId}
                    onSelect={(party) => setSelectedPartyId(party?.id || "")}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full h-[46px] px-3 rounded-[12px] bg-[#F6F8FC] dark:bg-[#0f172a] border border-border text-xs outline-none focus:border-blue focus:ring-2 focus:ring-blue/10 transition-all text-foreground font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    className="w-full h-[46px] px-3 rounded-[12px] bg-[#F6F8FC] dark:bg-[#0f172a] border border-border text-xs outline-none focus:border-blue focus:ring-2 focus:ring-blue/10 transition-all text-foreground"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full h-[46px] px-3 rounded-[12px] bg-[#F6F8FC] dark:bg-[#0f172a] border border-border text-xs outline-none focus:border-blue focus:ring-2 focus:ring-blue/10 transition-all text-foreground cursor-pointer font-medium"
                  >
                    <option value="cash">💵 Cash</option>
                    <option value="upi">⚡ UPI / GPay</option>
                    <option value="bank">🏛️ Bank Transfer</option>
                    <option value="cheque">✍️ Cheque</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                    Reference / UPI No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Txn ID, Chq No"
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full h-[46px] px-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all font-medium placeholder-gray-400"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-[11px] font-bold text-textMuted uppercase tracking-wider">
                    Notes
                  </label>
                  <textarea
                    placeholder="Enter payment notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full p-4 rounded-[12px] bg-white dark:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] text-sm text-foreground outline-none focus:ring-2 focus:ring-blue/15 focus:border-blue transition-all resize-none font-medium placeholder-gray-400"
                  />
                </div>
              </div>

              {formError && (
                <div className="text-xs font-semibold text-red bg-red/10 border border-red/20 px-3 py-2 rounded-lg">
                  ⚠️ {formError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-border mt-5">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="px-5 py-2.5 rounded-xl hover:bg-[#F6F8FC] dark:hover:bg-[#0f172a] border border-[#D1D5DB] dark:border-[#374151] bg-white dark:bg-[#0f172a] text-xs font-bold text-textMuted cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPaymentMutation.isPending}
                  className="px-6 py-2.5 rounded-xl bg-blue hover:bg-[#1D4ED8] text-white text-xs font-bold transition-all shadow-md shadow-blue/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {addPaymentMutation.isPending ? "Posting..." : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
