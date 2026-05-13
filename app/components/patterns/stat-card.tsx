"use client"

import * as React from "react"
import { Area, AreaChart, ResponsiveContainer } from "recharts"
import { ArrowDown, ArrowUp, Minus } from "lucide-react"

import { Card } from "@/app/components/ui/card"
import { cn } from "@/app/lib/utils"

/**
 * StatCard — the KPI tile used across the dashboard landing
 * and analytics surfaces. Matches the user-approved
 * Operations Overview mock: label in uppercase muted caps,
 * tabular-number value, optional unit suffix, inline trend
 * delta (with arrow + success/danger coloring), and an
 * optional sparkline.
 *
 * Each card can be a link; when `href` is provided it renders
 * as an <a> with appropriate hover affordance so operators
 * can drill into the filtered detail view.
 */

export interface StatCardTrend {
  /** Numeric delta. Positive = up, negative = down. */
  delta: number
  /** How to label the delta (e.g., "vs last week"). */
  label: string
  /**
   * Semantic direction. Sometimes "up" is good (revenue);
   * sometimes "up" is bad (waste %). Callers pick.
   */
  intent?: "positive-up" | "negative-up"
  /** Pre-formatted delta string ("3.2%", "+12%"). */
  formatted?: string
}

export interface StatCardProps extends React.ComponentProps<"div"> {
  label: string
  value: React.ReactNode
  unit?: string
  icon?: React.ReactNode
  trend?: StatCardTrend
  /** 8–20 point time series for the inline sparkline. */
  sparkline?: ReadonlyArray<number>
  /** Color role for the sparkline stroke. */
  sparkIntent?: "accent" | "success" | "warning" | "danger"
  /** If provided, the whole card becomes a link. */
  href?: string
  /** Subtitle below the value (e.g., "4 due this week"). */
  footnote?: React.ReactNode
}

const intentClasses = {
  positive: "text-[color:var(--success-foreground)]",
  negative: "text-[color:var(--danger-foreground)]",
  neutral: "text-muted-foreground",
} as const

/**
 * Sparkline stroke colors. Values resolve via CSS vars at render
 * time — SVG gradient stops reliably accept `var()` as long as the
 * target property is `color` or `fill` / `stroke`, but oklch()
 * inside `stopColor` has inconsistent browser support, so we pass
 * the token string straight through to `stroke` + `fill` with
 * `fillOpacity` for the tint rather than a gradient.
 */
const sparkStroke = {
  accent: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
} as const

function resolveTrendIntent(trend: StatCardTrend): keyof typeof intentClasses {
  if (trend.delta === 0) return "neutral"
  const up = trend.delta > 0
  const intent = trend.intent ?? "positive-up"
  if (intent === "positive-up") return up ? "positive" : "negative"
  return up ? "negative" : "positive"
}

export function StatCard({
  label,
  value,
  unit,
  icon,
  trend,
  sparkline,
  sparkIntent = "accent",
  href,
  footnote,
  className,
  ...props
}: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon && <span className="flex size-3.5 items-center justify-center [&_svg]:size-3.5">{icon}</span>}
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em]">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="tabular font-display font-semibold text-[28px] leading-8 text-foreground tracking-tight">
          {value}
        </span>
        {unit && (
          <span className="tabular font-medium text-lg text-muted-foreground">{unit}</span>
        )}
      </div>
      {(trend || footnote) && (
        <div className="flex items-center gap-1.5 text-xs">
          {trend && (
            <span className={cn("inline-flex items-center gap-0.5", intentClasses[resolveTrendIntent(trend)])}>
              {trend.delta > 0 && <ArrowUp className="size-3" aria-hidden="true" />}
              {trend.delta < 0 && <ArrowDown className="size-3" aria-hidden="true" />}
              {trend.delta === 0 && <Minus className="size-3" aria-hidden="true" />}
              <span className="tabular font-medium">
                {trend.formatted ?? `${Math.abs(trend.delta)}%`}
              </span>
              <span className="text-muted-foreground">{trend.label}</span>
            </span>
          )}
          {footnote && !trend && (
            <span className="text-muted-foreground">{footnote}</span>
          )}
        </div>
      )}
      {sparkline && sparkline.length > 0 && (
        <div className="-mx-1 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline.map((v, i) => ({ i, v }))}>
              <Area
                type="monotone"
                dataKey="v"
                stroke={sparkStroke[sparkIntent]}
                strokeWidth={1.5}
                fill={sparkStroke[sparkIntent]}
                fillOpacity={0.16}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )

  const cardClasses = cn(
    "flex flex-col gap-3 rounded-md border border-border-subtle bg-card p-5 transition-colors",
    href && "hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    className
  )

  if (href) {
    return (
      <a href={href} className={cardClasses} data-slot="stat-card" {...(props as React.ComponentProps<"a">)}>
        {content}
      </a>
    )
  }

  return (
    <Card data-slot="stat-card" className={cardClasses} {...props}>
      {content}
    </Card>
  )
}
