"use client"

import Link from "next/link"

import { Button } from "@/app/components/ui/button"

export default function Unavailable503() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center space-y-2 text-center">
      <h1 className="font-semibold text-2xl">Unavailable.</h1>
      <p className="text-muted-foreground">
        The service is temporarily unavailable. Please try again shortly.
      </p>
      <Link prefetch={false} replace href="/dashboard">
        <Button variant="outline">Go back home</Button>
      </Link>
    </div>
  )
}
