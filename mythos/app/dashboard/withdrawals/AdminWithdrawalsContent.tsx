"use client";

import { Fragment, useState, useEffect } from "react";

interface Withdrawal {
  id: string;
  merchant_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  status: string;
  debit_transaction_id: string | null;
  completion_transaction_id: string | null;
  reversal_transaction_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  completed_by: string | null;
  failed_by: string | null;
  failure_code: string | null;
  failure_message: string | null;
  created_at: string;
  approved_at: string | null;
  processed_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  reversed_at: string | null;
  canceled_at: string | null;
}

interface PaginatedWithdrawalsResponse {
  data: Withdrawal[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    count: number;
    limit: number;
    total: number;
  };
}

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "canceled", label: "Canceled" },
];

export default function AdminWithdrawalsContent() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchWithdrawals = async (cursor?: string, signal?: AbortSignal) => {
    const isInitialLoad = !cursor;
    isInitialLoad ? setLoading(true) : setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (statusFilter) params.set("status", statusFilter);
      if (cursor) params.set("cursor", cursor);

      const response = await fetch(`/api/admin/withdrawals?${params}`, { signal });

      if (signal?.aborted) return;

      if (response.ok) {
        const data = await response.json();

        if (data.data && data.pagination) {
          const paginatedData = data as PaginatedWithdrawalsResponse;
          setWithdrawals((prev) =>
            cursor ? [...prev, ...paginatedData.data] : paginatedData.data
          );
          setNextCursor(paginatedData.pagination.next_cursor);
          setHasMore(paginatedData.pagination.has_more);
          setTotal(paginatedData.pagination.total);
        } else if (Array.isArray(data)) {
          setWithdrawals(data);
          setHasMore(false);
          setTotal(data.length);
        }
        setError(null);
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        setError(errorData.error || "Failed to load withdrawals");
        if (isInitialLoad) setWithdrawals([]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Failed to load withdrawals:", err);
      setError("Failed to load withdrawals");
      if (isInitialLoad) setWithdrawals([]);
    } finally {
      if (!signal?.aborted) {
        isInitialLoad ? setLoading(false) : setLoadingMore(false);
      }
    }
  };

  const performAction = async (
    withdrawalId: string,
    action: string,
    body?: Record<string, string>
  ) => {
    setActionLoading(withdrawalId);
    setError(null);

    try {
      const response = await fetch(
        `/api/admin/withdrawals/${withdrawalId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }
      );

      if (response.ok) {
        await fetchWithdrawals();
      } else {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        setError(errorData.error || `Failed to ${action} withdrawal`);
      }
    } catch {
      setError(`Failed to ${action} withdrawal`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = (id: string) => {
    const note = prompt("Optional note for approval (leave blank to skip):");
    if (note === null) return; // User cancelled prompt
    performAction(id, "approve", note ? { note } : {});
  };

  const handleReject = (id: string) => {
    if (!confirm("Are you sure you want to reject this withdrawal? This will reverse the balance debit.")) return;
    const note = prompt("Optional note for rejection (leave blank to skip):");
    if (note === null) return;
    performAction(id, "reject", note ? { note } : {});
  };

  const handleComplete = (id: string) => {
    if (!confirm("Mark this withdrawal as completed? This confirms the bank transfer has been sent.")) return;
    performAction(id, "complete");
  };

  const handleFail = (id: string) => {
    const failureCode = prompt("Failure code (required):");
    if (!failureCode) return;
    const failureMessage = prompt("Failure message (optional):") || "";
    performAction(id, "fail", {
      failure_code: failureCode,
      failure_message: failureMessage,
    });
  };

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setActionLoading(null);
    fetchWithdrawals(undefined, controller.signal);
    return () => controller.abort();
  }, [statusFilter]);

  const formatMicrounits = (microunits: number) => {
    const whole = Math.floor(microunits / 1_000_000);
    const frac = microunits % 1_000_000;
    const fracStr = frac
      .toString()
      .padStart(6, "0")
      .replace(/0+$/, "")
      .padEnd(2, "0");
    return `${whole.toLocaleString("en-US")}.${fracStr}`;
  };

  const formatAmount = (microunits: number) =>
    `$${formatMicrounits(microunits)}`;

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

  const timeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
      return `about ${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
      return `about ${hours} hour${hours !== 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    return `about ${days} day${days !== 1 ? "s" : ""} ago`;
  };

  const truncateId = (id: string) => {
    if (id.length <= 12) return id;
    return `${id.slice(0, 6)}...${id.slice(-4)}`;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending_approval: "bg-yellow-100 text-yellow-800",
      approved: "bg-blue-100 text-blue-800",
      processing: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      failed: "bg-red-100 text-red-800",
      canceled: "bg-gray-100 text-gray-800",
    };
    const labels: Record<string, string> = {
      pending_approval: "Pending",
      approved: "Approved",
      processing: "Processing",
      completed: "Completed",
      failed: "Failed",
      canceled: "Canceled",
    };
    return (
      <span
        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${styles[status] || "bg-gray-100 text-gray-800"}`}
      >
        {labels[status] || status}
      </span>
    );
  };

  const detailRow = (label: string, value: string | null, mono = false) => (
    <div className="flex gap-4 py-1 text-sm">
      <span className="w-32 shrink-0 text-gray-500">{label}</span>
      <span
        className={`text-gray-900 break-all ${mono ? "font-mono text-xs" : ""}`}
      >
        {value || "—"}
      </span>
    </div>
  );

  const detailSection = (title: string, rows: React.ReactNode) => (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h3>
      {rows}
    </div>
  );

  const renderDetailPanel = (w: Withdrawal) => {
    const hasReview = w.reviewed_by || w.reviewed_at || w.review_note;
    const hasCompletion = !!w.completed_by;
    const hasFailure = w.failed_by || w.failure_code || w.failure_message;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        {detailSection(
          "Identifiers",
          <>
            {detailRow("ID", w.id, true)}
            {detailRow("Merchant ID", w.merchant_id, true)}
          </>
        )}
        {detailSection(
          "Timeline",
          <>
            {detailRow("Requested", formatDate(w.created_at))}
            {detailRow("Approved", w.approved_at && formatDate(w.approved_at))}
            {detailRow(
              "Processed",
              w.processed_at && formatDate(w.processed_at)
            )}
            {detailRow(
              "Completed",
              w.completed_at && formatDate(w.completed_at)
            )}
            {detailRow("Failed", w.failed_at && formatDate(w.failed_at))}
            {detailRow(
              "Reversed",
              w.reversed_at && formatDate(w.reversed_at)
            )}
            {detailRow(
              "Canceled",
              w.canceled_at && formatDate(w.canceled_at)
            )}
          </>
        )}
        {hasReview &&
          detailSection(
            "Review",
            <>
              {detailRow("Reviewer", w.reviewed_by, true)}
              {detailRow(
                "Reviewed at",
                w.reviewed_at && formatDate(w.reviewed_at)
              )}
              {detailRow("Note", w.review_note)}
            </>
          )}
        {hasCompletion &&
          detailSection(
            "Completion",
            detailRow("Completed by", w.completed_by, true)
          )}
        {hasFailure &&
          detailSection(
            "Failure",
            <>
              {detailRow("Failed by", w.failed_by, true)}
              {detailRow("Code", w.failure_code)}
              {detailRow("Message", w.failure_message)}
            </>
          )}
        {detailSection(
          "Ledger Transactions",
          <>
            {detailRow("Debit", w.debit_transaction_id, true)}
            {detailRow("Completion", w.completion_transaction_id, true)}
            {detailRow("Reversal", w.reversal_transaction_id, true)}
          </>
        )}
      </div>
    );
  };

  const renderActions = (w: Withdrawal) => {
    const isLoading = actionLoading === w.id;

    if (isLoading) {
      return (
        <span className="text-xs text-gray-400">Processing...</span>
      );
    }

    switch (w.status) {
      case "pending_approval":
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleApprove(w.id)}
              className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => handleReject(w.id)}
              className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
            >
              Reject
            </button>
          </div>
        );
      case "approved":
      case "processing":
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleComplete(w.id)}
              className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition-colors"
            >
              Complete
            </button>
            <button
              onClick={() => handleFail(w.id)}
              className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
            >
              Fail
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">
            Withdrawals
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage withdrawal requests across all merchants.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <span className="flex-1 text-sm">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600"
          >
            &times;
          </button>
        </div>
      )}

      {!withdrawals || withdrawals.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-400 mb-1">No withdrawals found</p>
          <p className="text-sm text-gray-400">
            {statusFilter
              ? "Try a different status filter."
              : "Withdrawals will appear here once merchants request payouts."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200">
                <th className="pb-3 pr-4 text-left text-sm font-medium text-gray-400">
                  ID
                </th>
                <th className="pb-3 px-4 text-left text-sm font-medium text-gray-400">
                  Merchant
                </th>
                <th className="pb-3 px-4 text-left text-sm font-medium text-gray-400">
                  Amount
                </th>
                <th className="pb-3 px-4 text-left text-sm font-medium text-gray-400">
                  Fee
                </th>
                <th className="pb-3 px-4 text-left text-sm font-medium text-gray-400">
                  Net
                </th>
                <th className="pb-3 px-4 text-left text-sm font-medium text-gray-400">
                  Status
                </th>
                <th className="pb-3 px-4 text-left text-sm font-medium text-gray-400">
                  Requested
                </th>
                <th className="pb-3 pl-4 text-right text-sm font-medium text-gray-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w, i) => {
                const isExpanded = expandedId === w.id;
                const toggle = () =>
                  setExpandedId(isExpanded ? null : w.id);
                return (
                  <Fragment key={w.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      onClick={toggle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggle();
                        }
                      }}
                      className={`border-b border-zinc-200 hover:bg-zinc-200/50 transition-colors cursor-pointer ${
                        i % 2 === 0 ? "bg-zinc-100/50" : ""
                      }`}
                    >
                      <td className="py-4 pl-2 pr-4 font-mono text-xs text-gray-500">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="select-none text-gray-400 w-3 inline-block"
                          >
                            {isExpanded ? "▾" : "▸"}
                          </span>
                          {truncateId(w.id)}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-xs text-gray-500">
                        {truncateId(w.merchant_id)}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-900">
                        {formatAmount(w.amount)}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-500">
                        {formatAmount(w.fee)}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-900 font-medium">
                        {formatAmount(w.net_amount)}
                      </td>
                      <td className="py-4 px-4">{statusBadge(w.status)}</td>
                      <td className="py-4 px-4 text-sm text-gray-900">
                        {timeAgo(w.created_at)}
                      </td>
                      <td
                        className="py-4 pl-4 pr-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {renderActions(w)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                        <td colSpan={8} className="px-6 py-6">
                          {renderDetailPanel(w)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* hasMore is only true when nextCursor is non-null — backend sets
          HasMore: nextCursor != nil and only encodes NextCursor when non-nil */}
      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => fetchWithdrawals(nextCursor!)}
            disabled={loadingMore}
            className="px-5 py-2 text-sm border border-zinc-200 rounded-lg text-gray-600 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}

      {withdrawals.length > 0 && (
        <div className="mt-4 text-xs text-gray-400 text-center">
          Showing {withdrawals.length}
          {total !== null && ` of ${total}`} withdrawal
          {withdrawals.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
