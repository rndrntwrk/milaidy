/**
 * Color-coded status badges for transaction statuses.
 */

import type { StewardTxStatus } from "@miladyai/shared/contracts/wallet";

const STATUS_STYLES: Record<
  StewardTxStatus,
  { bg: string; text: string; label: string }
> = {
  pending: {
    bg: "bg-yellow-500/15 border-yellow-500/25",
    text: "text-yellow-400",
    label: "Pending",
  },
  approved: {
    bg: "bg-blue-500/15 border-blue-500/25",
    text: "text-blue-400",
    label: "Approved",
  },
  rejected: {
    bg: "bg-red-500/15 border-red-500/25",
    text: "text-red-400",
    label: "Rejected",
  },
  signed: {
    bg: "bg-emerald-500/15 border-emerald-500/25",
    text: "text-emerald-400",
    label: "Signed",
  },
  broadcast: {
    bg: "bg-cyan-500/15 border-cyan-500/25",
    text: "text-cyan-400",
    label: "Broadcast",
  },
  confirmed: {
    bg: "bg-green-500/15 border-green-500/25",
    text: "text-green-400",
    label: "Confirmed",
  },
  failed: {
    bg: "bg-red-500/15 border-red-500/25",
    text: "text-red-400",
    label: "Failed",
  },
};

export function TxStatusBadge({ status }: { status: StewardTxStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}
