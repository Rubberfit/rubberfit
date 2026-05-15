"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check } from "lucide-react"

import { Button } from "@/app/components/ui/button"
import { acceptInvitation } from "@/app/actions/invitations"

interface AcceptInvitationCtaProps {
  token: string
  tenantName: string
}

export function AcceptInvitationCta({ token, tenantName }: AcceptInvitationCtaProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const handleAccept = React.useCallback(async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const result = await acceptInvitation({ token })
      if (!result.ok) {
        toast.error("Could not accept invitation", {
          description: result.error,
        })
        return
      }
      toast.success(`Joined ${tenantName}`)
      // The action sets ACTIVE_TENANT_COOKIE and revalidates the root
      // layout — push to /dashboard so RSC re-fetches with the new
      // membership.
      router.push("/dashboard")
    } catch (error) {
      toast.error("Could not accept invitation", {
        description: error instanceof Error ? error.message : "Unexpected error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting, token, tenantName, router])

  return (
    <div className="mt-6 flex justify-center">
      <Button onClick={handleAccept} disabled={isSubmitting} size="lg">
        <Check className="size-4" aria-hidden="true" />
        {isSubmitting ? "Accepting…" : `Accept and join ${tenantName}`}
      </Button>
    </div>
  )
}
