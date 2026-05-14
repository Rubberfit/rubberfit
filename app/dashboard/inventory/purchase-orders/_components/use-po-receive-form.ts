"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import type { PurchaseOrderWithDetails } from "@/src/infrastructure/models/supabase"

export interface RollDataDraft {
  width: string
  length: string
  thickness: string
  color: string
  location: string
  cost_per_sqft: string
  notes: string
  date_received: string
}

export interface ItemDraft {
  itemId: string
  enabled: boolean
  quantityReceived: string
  rollData: RollDataDraft
  rollDataExpanded: boolean
  // Snapshot from the PO item — never edited, used for outstanding
  // calculation, defaults, and read-only display.
  quantitySqft: number
  alreadyReceivedSqft: number
  materialName: string
  defaultWidth: number | null
  defaultThickness: number | null
  defaultColor: string | null
}

export interface ReceivePayloadItem {
  itemId: string
  quantityReceived: number
  rollData?: {
    width?: number
    length?: number
    thickness?: number
    color?: string
    location?: string
    cost_per_sqft?: number
    notes?: string
    date_received?: string
  }
}

export interface ReceiveTotals {
  orderedSqft: number
  receivingSqft: number
  remainingAfterSqft: number
}

function emptyRollData(): RollDataDraft {
  return {
    width: "",
    length: "",
    thickness: "",
    color: "",
    location: "",
    cost_per_sqft: "",
    notes: "",
    date_received: "",
  }
}

function outstandingFor(item: { quantity_sqft: number; quantity_received?: number }): number {
  return Math.max(0, item.quantity_sqft - (item.quantity_received ?? 0))
}

function buildInitialDrafts(po: PurchaseOrderWithDetails): Record<string, ItemDraft> {
  const items = po.items ?? []
  const drafts: Record<string, ItemDraft> = {}
  for (const item of items) {
    const outstanding = outstandingFor(item)
    drafts[item.id] = {
      itemId: item.id,
      enabled: outstanding > 0,
      quantityReceived: outstanding > 0 ? String(outstanding) : "0",
      rollData: emptyRollData(),
      rollDataExpanded: false,
      quantitySqft: item.quantity_sqft,
      alreadyReceivedSqft: item.quantity_received ?? 0,
      materialName: item.description ?? "Item",
      defaultWidth: item.width ?? null,
      defaultThickness: item.thickness ?? null,
      defaultColor: item.color ?? null,
    }
  }
  return drafts
}

function isRollDataEmpty(rd: RollDataDraft): boolean {
  return (
    rd.width === "" &&
    rd.length === "" &&
    rd.thickness === "" &&
    rd.color === "" &&
    rd.location === "" &&
    rd.cost_per_sqft === "" &&
    rd.notes === "" &&
    rd.date_received === ""
  )
}

function buildRollDataPayload(rd: RollDataDraft): ReceivePayloadItem["rollData"] | undefined {
  if (isRollDataEmpty(rd)) return undefined
  const payload: NonNullable<ReceivePayloadItem["rollData"]> = {}
  // Strip empties; coerce numerics. Anything malformed (NaN) is
  // dropped — validate() catches submit-blocking issues elsewhere.
  if (rd.width !== "") {
    const n = Number(rd.width)
    if (Number.isFinite(n) && n > 0) payload.width = n
  }
  if (rd.length !== "") {
    const n = Number(rd.length)
    if (Number.isFinite(n) && n > 0) payload.length = n
  }
  if (rd.thickness !== "") {
    const n = Number(rd.thickness)
    if (Number.isFinite(n) && n > 0) payload.thickness = n
  }
  if (rd.cost_per_sqft !== "") {
    const n = Number(rd.cost_per_sqft)
    if (Number.isFinite(n) && n >= 0) payload.cost_per_sqft = n
  }
  if (rd.color !== "") payload.color = rd.color
  if (rd.location !== "") payload.location = rd.location
  if (rd.notes !== "") payload.notes = rd.notes
  if (rd.date_received !== "") payload.date_received = rd.date_received
  return Object.keys(payload).length > 0 ? payload : undefined
}

export interface UsePoReceiveFormApi {
  drafts: Record<string, ItemDraft>
  setDraft: (itemId: string, patch: Partial<ItemDraft>) => void
  setRollData: (itemId: string, patch: Partial<RollDataDraft>) => void
  defaultAllToOutstanding: () => void
  idempotencyKey: string
  regenerateKey: () => void
  totals: ReceiveTotals
  perItemErrors: Record<string, string | null>
  validate: () => { ok: boolean; error?: string }
  buildPayload: () => ReceivePayloadItem[]
  receivableItemIds: string[]
  alreadyReceivedItemIds: string[]
}

/**
 * Form-state hook for the PO Receive dialog. Owns:
 *
 *  - Per-item draft map keyed by itemId (re-render isolation via
 *    memo'd row components — each row reads its own slice).
 *  - `idempotencyKey` lifecycle per the action's contract
 *    (`app/actions/purchase-orders.ts:148-154`):
 *      • Regenerate on dialog open transition (false → true).
 *      • Regenerate on any field change (so an operator who
 *        corrects a quantity after a transient failure doesn't
 *        get the old value re-applied via dedup).
 *      • Regenerate after a successful submit (so a second submit
 *        in the same mount counts as a new attempt).
 *  - `buildPayload` strips disabled rows and empty rollData fields
 *    before handing to `receivePurchaseOrder`.
 *  - `validate` enforces ≥1 enabled item with positive quantity
 *    within outstanding bounds. Server entity guard is final
 *    authority on over-receive.
 */
export function usePoReceiveForm(
  po: PurchaseOrderWithDetails | null,
  open: boolean
): UsePoReceiveFormApi {
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID())

  const regenerateKey = useCallback(() => {
    setIdempotencyKey(crypto.randomUUID())
  }, [])

  // Seed drafts + a fresh key on every open transition. Closes leave
  // the previous state alone — submit handler resets on success
  // before closing, so a re-open starts fresh.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open && po) {
      setDrafts(buildInitialDrafts(po))
      setIdempotencyKey(crypto.randomUUID())
    }
  }, [open, po])
  /* eslint-enable react-hooks/set-state-in-effect */

  const setDraft = useCallback<UsePoReceiveFormApi["setDraft"]>((itemId, patch) => {
    setDrafts((prev) => {
      const current = prev[itemId]
      if (!current) return prev
      return { ...prev, [itemId]: { ...current, ...patch } }
    })
    setIdempotencyKey(crypto.randomUUID())
  }, [])

  const setRollData = useCallback<UsePoReceiveFormApi["setRollData"]>((itemId, patch) => {
    setDrafts((prev) => {
      const current = prev[itemId]
      if (!current) return prev
      return {
        ...prev,
        [itemId]: { ...current, rollData: { ...current.rollData, ...patch } },
      }
    })
    setIdempotencyKey(crypto.randomUUID())
  }, [])

  const defaultAllToOutstanding = useCallback(() => {
    setDrafts((prev) => {
      const next: Record<string, ItemDraft> = {}
      for (const [id, d] of Object.entries(prev)) {
        const outstanding = Math.max(0, d.quantitySqft - d.alreadyReceivedSqft)
        next[id] = {
          ...d,
          enabled: outstanding > 0,
          quantityReceived: outstanding > 0 ? String(outstanding) : "0",
        }
      }
      return next
    })
    setIdempotencyKey(crypto.randomUUID())
  }, [])

  const receivableItemIds = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.quantitySqft - d.alreadyReceivedSqft > 0)
        .sort((a, b) => a.itemId.localeCompare(b.itemId))
        .map((d) => d.itemId),
    [drafts]
  )

  const alreadyReceivedItemIds = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => d.quantitySqft - d.alreadyReceivedSqft <= 0)
        .sort((a, b) => a.itemId.localeCompare(b.itemId))
        .map((d) => d.itemId),
    [drafts]
  )

  const totals = useMemo<ReceiveTotals>(() => {
    let ordered = 0
    let receiving = 0
    let receivedAlready = 0
    for (const d of Object.values(drafts)) {
      ordered += d.quantitySqft
      receivedAlready += d.alreadyReceivedSqft
      if (d.enabled) {
        const n = Number(d.quantityReceived)
        if (Number.isFinite(n) && n > 0) {
          // Cap at outstanding for the displayed total so an over-
          // receive typo doesn't make the banner read "receiving
          // 999 sqft of 100" — the inline error already flags it.
          const outstanding = Math.max(0, d.quantitySqft - d.alreadyReceivedSqft)
          receiving += Math.min(n, outstanding)
        }
      }
    }
    return {
      orderedSqft: ordered,
      receivingSqft: receiving,
      remainingAfterSqft: Math.max(0, ordered - receivedAlready - receiving),
    }
  }, [drafts])

  const perItemErrors = useMemo<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {}
    for (const d of Object.values(drafts)) {
      if (!d.enabled) {
        out[d.itemId] = null
        continue
      }
      const outstanding = Math.max(0, d.quantitySqft - d.alreadyReceivedSqft)
      if (d.quantityReceived === "") {
        out[d.itemId] = "Enter a quantity"
        continue
      }
      const n = Number(d.quantityReceived)
      if (!Number.isFinite(n)) {
        out[d.itemId] = "Quantity must be a number"
        continue
      }
      if (n <= 0) {
        out[d.itemId] = "Quantity must be greater than 0"
        continue
      }
      if (n > outstanding) {
        out[d.itemId] = `Exceeds outstanding (${outstanding} sqft)`
        continue
      }
      out[d.itemId] = null
    }
    return out
  }, [drafts])

  const validate = useCallback<UsePoReceiveFormApi["validate"]>(() => {
    const enabled = Object.values(drafts).filter((d) => d.enabled)
    if (enabled.length === 0) {
      return { ok: false, error: "Enable at least one item to receive" }
    }
    for (const d of enabled) {
      const err = perItemErrors[d.itemId]
      if (err) return { ok: false, error: err }
    }
    return { ok: true }
  }, [drafts, perItemErrors])

  const buildPayload = useCallback<UsePoReceiveFormApi["buildPayload"]>(() => {
    const items: ReceivePayloadItem[] = []
    for (const d of Object.values(drafts)) {
      if (!d.enabled) continue
      const n = Number(d.quantityReceived)
      if (!Number.isFinite(n) || n <= 0) continue
      const rollData = buildRollDataPayload(d.rollData)
      items.push({
        itemId: d.itemId,
        quantityReceived: n,
        ...(rollData ? { rollData } : {}),
      })
    }
    return items
  }, [drafts])

  return {
    drafts,
    setDraft,
    setRollData,
    defaultAllToOutstanding,
    idempotencyKey,
    regenerateKey,
    totals,
    perItemErrors,
    validate,
    buildPayload,
    receivableItemIds,
    alreadyReceivedItemIds,
  }
}
