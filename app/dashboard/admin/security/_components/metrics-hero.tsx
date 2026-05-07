"use client"

import { StatCard } from "@/app/components/patterns"

import { HERO_METRICS } from "./mock-data"

const NUMBER_FORMAT = new Intl.NumberFormat("en-US")
const PERCENT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

export function MetricsHero() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Active sessions"
        value={NUMBER_FORMAT.format(HERO_METRICS.activeSessions)}
        trend={{
          delta: HERO_METRICS.activeSessionsTrend,
          label: "vs last week",
          intent: "positive-up",
        }}
      />
      <StatCard
        label="MFA enrolled"
        value={PERCENT_FORMAT.format(HERO_METRICS.mfaEnrollmentPercent)}
        unit="%"
        trend={{
          delta: HERO_METRICS.mfaEnrollmentTrend,
          label: "vs last week",
          intent: "positive-up",
        }}
      />
      <StatCard
        label="Audit events 7d"
        value={NUMBER_FORMAT.format(HERO_METRICS.auditEvents7d)}
        trend={{
          delta: HERO_METRICS.auditEvents7dTrend,
          label: "vs prior 7d",
          intent: "negative-up",
        }}
      />
      <StatCard
        label="Failed logins 24h"
        value={NUMBER_FORMAT.format(HERO_METRICS.failedLogins24h)}
        trend={{
          delta: HERO_METRICS.failedLogins24hTrend,
          label: "vs prior 24h",
          intent: "negative-up",
        }}
      />
    </div>
  )
}
