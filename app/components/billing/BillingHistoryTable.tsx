import * as React from "react"
import Link from "next/link"

import { StatusPill } from "./StatusPill"

export interface BillingHistoryRow {
  id: string
  date: string
  plan: "STANDARD" | "PRO" | "MAX" | "ENTERPRISE"
  // Pre-Stripe-rollout rows can have NULL `billing_interval`. Render
  // those as `—` rather than silently labelling them MONTHLY.
  interval: "MONTHLY" | "ANNUAL" | null
  seats: number | null
  periodStart: string | null
  periodEnd: string | null
  amountCents: number | null
  status: "paid" | "failed" | "refunded" | "pending"
  invoiceUrl: string | null
}

interface BillingHistoryTableProps {
  rows: readonly BillingHistoryRow[]
}

/**
 * Formats a cents amount as `$N` for whole dollars or `$N.CC` for
 * non-zero remainders. Null returns the em-dash placeholder so empty
 * cells line up with the spec.
 *
 * Handles negative amounts (Stripe refunds) by extracting the sign
 * first and operating on `Math.abs` — `Math.floor` on negatives
 * rounds away from zero, and `%` on negatives keeps the sign, so a
 * naive `Math.floor(cents / 100)` + `cents % 100` would produce
 * `$-51.-50` for -5050 cents instead of `-$50.50`.
 */
function formatAmount(cents: number | null): string {
  if (cents === null) return "—"
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  const formattedDollars = dollars.toLocaleString("en-US")
  if (remainder === 0) {
    return `${sign}$${formattedDollars}`
  }
  const centsStr = remainder.toString().padStart(2, "0")
  return `${sign}$${formattedDollars}.${centsStr}`
}

function nullableText(value: string | number | null): React.ReactNode {
  if (value === null) return "—"
  return value
}

const HEADER_CELL =
  "h-[40px] px-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]"
const BODY_MONO = "px-4 font-[family-name:var(--font-mono)] text-[13px] text-[var(--color-ink)]"
const BODY_MONO_SOFT =
  "px-4 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink-soft)]"
const BODY_MONO_UPPER =
  "px-4 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink)]"
const BODY_AMOUNT =
  "px-4 text-right font-[family-name:var(--font-mono)] text-[14px] text-[var(--color-ink)]"

const COLUMNS = 9

export function BillingHistoryTable({ rows }: BillingHistoryTableProps) {
  return (
    <div>
      <div className="mb-6">
        <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-[var(--color-signal)]">
          /BILLING HISTORY
        </h2>
        <p className="mt-1 font-[family-name:var(--font-sans)] text-[14px] text-[var(--color-ink-soft)]">
          Historical invoices and payment records.
        </p>
      </div>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--color-rule)] bg-[var(--color-surface)]">
            <th className={`${HEADER_CELL} text-left`}>Date</th>
            <th className={`${HEADER_CELL} text-left`}>Plan</th>
            <th className={`${HEADER_CELL} text-left`}>Interval</th>
            <th className={`${HEADER_CELL} text-right`}>Seats</th>
            <th className={`${HEADER_CELL} text-left`}>Period start</th>
            <th className={`${HEADER_CELL} text-left`}>Period end</th>
            <th className={`${HEADER_CELL} text-right`}>Amount</th>
            <th className={`${HEADER_CELL} text-left`}>Status</th>
            <th className={`${HEADER_CELL} text-left`}>Invoice</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS} className="py-16 text-center">
                <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase text-[var(--color-ink-faint)]">
                  NO RECORDS
                </div>
                <div className="mt-1 font-[family-name:var(--font-sans)] text-[13px] text-[var(--color-ink-faint)]">
                  Invoices will appear here after your first payment.
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className="h-[56px] border-b border-[var(--color-rule)] transition-colors duration-150 hover:bg-[rgba(236,234,228,0.6)]"
              >
                <td className={BODY_MONO}>{row.date}</td>
                <td className={BODY_MONO_UPPER}>{row.plan}</td>
                <td className={BODY_MONO_UPPER}>{row.interval ?? "—"}</td>
                <td className={`${BODY_MONO} text-right`}>{nullableText(row.seats)}</td>
                <td className={BODY_MONO_SOFT}>{nullableText(row.periodStart)}</td>
                <td className={BODY_MONO_SOFT}>{nullableText(row.periodEnd)}</td>
                <td className={BODY_AMOUNT}>{formatAmount(row.amountCents)}</td>
                <td className="px-4">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-4">
                  {row.invoiceUrl ? (
                    <Link
                      href={row.invoiceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-[family-name:var(--font-mono)] text-[12px] uppercase text-[var(--color-blueprint)] hover:underline"
                    >
                      PDF
                    </Link>
                  ) : (
                    <span className="font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-ink-faint)]">
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
