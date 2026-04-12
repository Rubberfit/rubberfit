"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
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

const FormSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
})

export function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const { resetPassword } = useAuth()

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      email: "",
    },
  })

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    setIsLoading(true)

    try {
      const { success, error } = await resetPassword(data.email)

      if (success) {
        setEmailSent(true)
        toast.success("Reset link sent!", {
          description: "Please check your email for password reset instructions.",
        })
      } else {
        toast.error("Reset failed", {
          description: error || "Please check your email address and try again.",
        })
      }
    } catch (_error) {
      toast.error("Reset failed", {
        description: "An unexpected error occurred. Please try again.",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="space-y-4 text-center">
        <div className="space-y-2">
          <h3 className="font-semibold text-lg">Check your email</h3>
          <p className="text-muted-foreground text-sm">
            We've sent a password reset link to {form.getValues("email")}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setEmailSent(false)
            form.reset()
          }}
          className="w-full"
        >
          Send another email
        </Button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address</FormLabel>
              <FormControl>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button className="w-full" type="submit" disabled={isLoading}>
          {isLoading ? "Sending reset link..." : "Send reset link"}
        </Button>
      </form>
    </Form>
  )
}
