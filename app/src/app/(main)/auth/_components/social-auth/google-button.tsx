"use client";

import { siGoogle } from "simple-icons";
import { useState } from "react";
import { toast } from "sonner";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export function GoogleButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const [isLoading, setIsLoading] = useState(false);
  const { signInWithGoogle } = useAuth();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);

    try {
      const { success, error } = await signInWithGoogle();

      if (!success) {
        toast.error("Google sign in failed", {
          description: error ?? "An unknown error occurred",
        });
      }
    } catch {
      toast.error("An error occurred", {
        description: "Failed to initiate Google sign in",
      });
    } finally {
      setIsLoading(false);
    }
  };

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
  );
}
