"use client"

import { useState } from "react"

import { siGoogle } from "simple-icons"
import { toast } from "sonner"

import { SimpleIcon } from "@/app/components/simple-icon"
import { Button } from "@/app/components/ui/button"
import { useAuth } from "@/app/contexts/AuthContext"
import { cn } from "@/app/lib/utils"

interface GoogleButtonProps extends React.ComponentProps<typeof Button> {
  redirectTo?: string | null
}

export function GoogleButton({ className, redirectTo, ...props }: GoogleButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { signInWithGoogle } = useAuth()

  const handleGoogleSignIn = async () => {
    setIsLoading(true)

    try {
      const { success, error } = await signInWithGoogle(redirectTo)

      if (!success) {
        toast.error("Google sign in failed", {
          description: error ?? "An unknown error occurred",
        })
      }
    } catch (_error) {
      toast.error("An error occurred", {
        description: "Failed to initiate Google sign in",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      variant="secondary"
      className={cn(className)}
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      {...props}
    >
      <SimpleIcon icon={siGoogle} className="size-4" />
      {isLoading ? "Connecting..." : "Continue with Google"}
    </Button>
  )
}
