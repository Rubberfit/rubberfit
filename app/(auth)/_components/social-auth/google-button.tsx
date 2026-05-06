"use client"

import { useState } from "react"

import { siGoogle } from "simple-icons"
import { toast } from "sonner"

import { SimpleIcon } from "@/app/components/simple-icon"
import { useAuth } from "@/app/contexts/AuthContext"

interface GoogleButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  redirectTo?: string | null
}

export function GoogleButton({
  className,
  redirectTo,
  ...props
}: GoogleButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { signInWithGoogle } = useAuth()

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      const { success, error } = await signInWithGoogle(redirectTo)
      if (!success) {
        toast.error("Google sign in failed", {
          description: error ?? "An unknown error occurred.",
        })
      }
    } catch (_error) {
      toast.error("An error occurred.", {
        description: "Failed to initiate Google sign in.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      className={["auth-btn-oauth", className].filter(Boolean).join(" ")}
      {...props}
    >
      <SimpleIcon icon={siGoogle} className="size-4" />
      {isLoading ? "Connecting…" : "Continue with Google"}
    </button>
  )
}
