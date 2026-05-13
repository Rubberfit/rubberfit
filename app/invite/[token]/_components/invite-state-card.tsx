"use client"

import * as React from "react"

interface InviteStateCardProps {
  icon?: React.ReactNode
  title: string
  body?: React.ReactNode
  cta?: React.ReactNode
}

export function InviteStateCard({ icon, title, body, cta }: InviteStateCardProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {icon && <div className="mb-4">{icon}</div>}
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      {body && <div className="mt-2 text-sm text-muted-foreground">{body}</div>}
      {cta && <div className="mt-6 w-full">{cta}</div>}
    </div>
  )
}
