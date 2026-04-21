"use client"

import { createContext, useContext, type ReactNode } from "react"
import { DEFAULT_UNIT_SYSTEM, type UnitSystem } from "@/app/lib/units"

const UnitSystemContext = createContext<UnitSystem>(DEFAULT_UNIT_SYSTEM)

interface UnitSystemProviderProps {
  value: UnitSystem
  children: ReactNode
}

export function UnitSystemProvider({ value, children }: UnitSystemProviderProps) {
  return (
    <UnitSystemContext.Provider value={value}>
      {children}
    </UnitSystemContext.Provider>
  )
}

export function useUnitSystem(): UnitSystem {
  return useContext(UnitSystemContext)
}
