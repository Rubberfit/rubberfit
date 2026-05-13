"use client"

import * as React from "react"
import { motion } from "framer-motion"

const EASE = [0.22, 1, 0.36, 1] as const

type MaxWidth = "sm" | "md" | "lg"

const maxWMap: Record<MaxWidth, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
}

interface LockCardProps {
  children: React.ReactNode
  maxW?: MaxWidth
}

export function LockCard({ children, maxW = "md" }: LockCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={`w-full ${maxWMap[maxW]} rounded-xl border border-[var(--color-ink-soft)]/10 bg-white/60 p-8 shadow-sm backdrop-blur-sm md:p-10`}
    >
      <div className="flex flex-col items-center text-center">{children}</div>
    </motion.div>
  )
}
