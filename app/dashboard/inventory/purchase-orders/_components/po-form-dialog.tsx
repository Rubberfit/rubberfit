"use client"

import { format, addDays } from "date-fns"

import { type Supplier } from "@/app/lib/supabase"

export interface POFormData {
  supplier_id: string
  requested_delivery_date: string
  payment_terms: string
  shipping_address: string
  billing_address: string
  notes: string
  items: Array<{
    material_type_id: string
    description: string
    width?: number
    length?: number
    thickness?: number
    color?: string
    quantity_sqft: number
    unit_cost: number
  }>
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

export function getEmptyItem() {
  return {
    material_type_id: "",
    description: "",
    width: undefined as number | undefined,
    length: undefined as number | undefined,
    thickness: undefined as number | undefined,
    color: "",
    quantity_sqft: 0,
    unit_cost: 0,
  }
}
