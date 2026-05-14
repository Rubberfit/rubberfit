import { isPlanTier, type FeatureKey } from "@/src/application/billing/feature-tiers"

import { FEATURE_COPY, TIER_META, getMissingFeatures } from "./_lib/feature-copy"
import { FeatureLockedPanel } from "./_components/feature-locked-panel"

interface LockedPageProps {
  searchParams: Promise<{
    feature?: string | string[]
    required?: string | string[]
    current?: string | string[]
    from?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function isFeatureKey(value: string): value is FeatureKey {
  return value in FEATURE_COPY
}

export default async function LockedPage({ searchParams }: LockedPageProps) {
  const resolved = await searchParams
  const featureParam = firstParam(resolved.feature)
  const requiredParam = firstParam(resolved.required)
  const currentParam = firstParam(resolved.current)
  const from = firstParam(resolved.from)

  // The proxy is the only writer of these search params and always
  // sets all four. If any are missing or invalid the user landed
  // here by hand-typing the URL — fall back to a generic message.
  const feature = featureParam && isFeatureKey(featureParam) ? featureParam : null
  const requiredTier = requiredParam && isPlanTier(requiredParam) ? requiredParam : null
  const currentTier = currentParam && isPlanTier(currentParam) ? currentParam : null

  if (!feature || !requiredTier || !currentTier) {
    return (
      <FeatureLockedPanel
        pathLabel="/LOCKED"
        headline="This page is not available."
        body="The URL you opened doesn't match an entitled feature on your plan."
        tierLabel={null}
        tierPrice={null}
        missingFeatures={[]}
        missingOverflow={0}
        from={null}
      />
    )
  }

  const copy = FEATURE_COPY[feature]
  const required = TIER_META[requiredTier]
  const missing = getMissingFeatures(currentTier, requiredTier)
  const pathLabel = `${copy.pathLabel} — ${required.label.toUpperCase()} TIER REQUIRED`

  return (
    <FeatureLockedPanel
      pathLabel={pathLabel}
      headline="This module is not included in your current workspace."
      body={`Upgrade to ${required.label} to unlock ${copy.label.toLowerCase()} and the full ${copy.category.toLowerCase()} suite.`}
      tierLabel={required.label}
      tierPrice={required.price}
      missingFeatures={missing.items}
      missingOverflow={missing.overflow}
      from={from ?? null}
    />
  )
}
