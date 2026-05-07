"use client"

import { format, addDays } from "date-fns"

import { type Supplier } from "@/src/infrastructure/models/supabase"

export interface POFormItem {
  /**
   * Stable client-side row id. Generated when the operator adds
   * the item; survives reorder/remove so React can preserve
   * input focus + state across re-renders. Server actions strip
   * this before forwarding to the use-case.
   */
  client_id: string
  material_type_id: string
  description: string
  width?: number
  length?: number
  thickness?: number
  color?: string
  quantity_sqft: number
  unit_cost: number
}

export interface POFormData {
  supplier_id: string
  requested_delivery_date: string
  payment_terms: string
  shipping_address: string
  billing_address: string
  notes: string
  items: POFormItem[]
}

export function getDefaultFormData(): POFormData {
  return {
    supplier_id: "",
    requested_delivery_date: format(addDays(new Date(), 7), "yyyy-MM-dd"),
    payment_terms: "Net 30",
    shipping_address: "",
    billing_address: "",
    notes: "",
    items: [],
  }
}

export function buildSupplierAddress(supplier: Supplier | undefined): string {
  if (!supplier) return ""
  const parts = []
  if (supplier.address) parts.push(supplier.address)
  const cityStateZip = [supplier.city, supplier.state, supplier.zip_code].filter(Boolean).join(" ")
  if (cityStateZip) parts.push(cityStateZip)
  if (supplier.country) parts.push(supplier.country)
  return parts.join(", ") || ""
}

// Increment-only counter for client_id generation. Form item rows
// only need uniqueness within a single browser session, so a
// per-module counter is plenty — no need to pull in a UUID lib.
let nextClientId = 0
function makeClientId(): string {
  nextClientId += 1
  return `po-item-${nextClientId}`
}

export function getEmptyItem(): POFormItem {
  return {
    client_id: makeClientId(),
    material_type_id: "",
    description: "",
    width: undefined,
    length: undefined,
    thickness: undefined,
    color: "",
    quantity_sqft: 0,
    unit_cost: 0,
  }
}
