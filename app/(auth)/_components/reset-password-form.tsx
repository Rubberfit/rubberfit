"use client"

import { useEffect, useState } from "react"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/app/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import { Input } from "@/app/components/ui/input"
import { useAuth } from "@/app/contexts/AuthContext"
import { supabase } from "@/src/infrastructure/models/supabase"
import type { AuthChangeEvent, Session } from "@supabase/supabase-js"

const FormSchema = z
  .object({
    password: z.string().min(6, { message: "Password must be at least 6 characters." }),
    confirmPassword: z
      .string()
      .min(6, { message: "Confirm Password must be at least 6 characters." }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })

interface ResetPasswordFormProps {
  recoveryMode?: boolean
}

function hasRecoveryHash() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash
  const hashParams = new URLSearchParams(hash)

  return (
    hashParams.get("type") === "recovery" ||
    (hashParams.has("access_token") && hashParams.has("refresh_token"))
  )
}

export function ResetPasswordForm({ recoveryMode = false }: ResetPasswordFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const router = useRouter()
  const { updatePassword } = useAuth()

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  })

  useEffect(() => {
    let active = true
    const isRecoveryRequest = recoveryMode || hasRecoveryHash()

    const markReady = () => {
      if (!active) {
        return
      }

      setStatus("ready")
      setErrorMessage(null)
    }

    const markError = (message: string) => {
      if (!active) {
        return
      }

      setStatus("error")
      setErrorMessage(message)
    }

    const getRecoverySession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession()

      return { session, error }
    }

    const hydrateRecoverySession = async () => {
      const { session, error } = await getRecoverySession()

      if (!active) {
        return
      }

      if (error) {
        markError(error.message)
        return
      }

      if (session && isRecoveryRequest) {
        markReady()
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!active || !session) {
        return
      }

      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && isRecoveryRequest)) {
        markReady()
      }
    })

    void hydrateRecoverySession()

    const timeoutId = window.setTimeout(async () => {
      const { session, error } = await getRecoverySession()

      if (!active) {
        return
      }

      if (error) {
        markError(error.message)
        return
      }

      if (session && isRecoveryRequest) {
        markReady()
        return
      }

      markError("This password reset link is invalid or has expired. Request a new reset email.")
    }, 1500)

    return () => {
      active = false
      window.clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [recoveryMode])

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    setIsLoading(true)

    try {
      const { success, error, redirectTo } = await updatePassword(data.password)

      if (success) {
        toast.success("Password updated", {
          description: "Your password has been reset. Redirecting now.",
        })
        router.replace(redirectTo ?? "/dashboard")
      } else {
        toast.error("Password reset failed", {
          description: error || "Please request a new reset link and try again.",
        })
      }
    } catch (_error) {
      toast.error("Password reset failed", {
        description: "An unexpected error occurred. Please request a new reset link and try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (status === "checking") {
    return (
      <div className="space-y-2 text-center">
        <h3 className="font-semibold text-lg">Verifying reset link</h3>
        <p className="text-muted-foreground text-sm">
          Please wait while we prepare your password reset session.
        </p>
      </div>
    )
  }

  if (status === "error") {
    return (
      <div className="space-y-4 text-center">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Reset link unavailable</h3>
          <p className="text-muted-foreground text-sm">{errorMessage}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/auth/v2/forgot-password">Request a new reset email</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/auth/v2/login">Back to login</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New Password</FormLabel>
              <FormControl>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? "Updating password..." : "Update password"}
        </Button>
      </form>
    </Form>
  )
}
