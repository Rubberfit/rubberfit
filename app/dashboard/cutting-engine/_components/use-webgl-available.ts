"use client"

import { useEffect, useState } from "react"

/**
 * Detects whether the browser can create a WebGL context. Used by the
 * gasket-cutting workspace to decide between the 3D `<ThreeSheetRenderer>`
 * and the 2D `<KonvaSheetRenderer>` fallback.
 *
 * Returns `null` during the initial mount + first render (SSR-safe),
 * then resolves to `true` / `false`. Consumers should render the 2D
 * fallback while the value is `null` so the operator never sees a
 * blank canvas during detection.
 */
export function useWebGLAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      setAvailable(false)
      return
    }
    try {
      const canvas = document.createElement("canvas")
      const ctx =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl")
      setAvailable(ctx !== null)
    } catch {
      setAvailable(false)
    }
  }, [])

  return available
}
