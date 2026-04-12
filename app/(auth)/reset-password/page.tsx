import Link from "next/link"

import { Globe } from "lucide-react"

import { APP_CONFIG } from "@/config/app-config"

import { ResetPasswordForm } from "../_components/reset-password-form"

interface ResetPasswordPageProps {
	searchParams?:
		| Promise<{
				mode?: string | string[]
		  }>
		| {
				mode?: string | string[]
		  }
}

export default async function ResetPasswordPage({
	searchParams,
}: ResetPasswordPageProps) {
	const resolvedSearchParams = await Promise.resolve(searchParams)
	const mode = Array.isArray(resolvedSearchParams?.mode)
		? resolvedSearchParams.mode[0]
		: resolvedSearchParams?.mode

	return (
		<>
			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Reset Password</h1>
					<p className="text-muted-foreground text-sm">
						Choose a new password to finish recovering your account.
					</p>
				</div>
				<div className="space-y-4">
					<ResetPasswordForm recoveryMode={mode === "recovery"} />
				</div>
			</div>

			<div className="absolute top-5 flex w-full justify-end px-10">
				<div className="text-muted-foreground text-sm">
					Remember your password?{" "}
					<Link
						prefetch={false}
						className="text-foreground"
						href="/auth/v2/login"
					>
						Back to login
					</Link>
				</div>
			</div>

			<div className="absolute bottom-5 flex w-full justify-between px-10">
				<div className="text-sm">{APP_CONFIG.copyright}</div>
				<div className="flex items-center gap-1 text-sm">
					<Globe className="size-4 text-muted-foreground" />
					ENG
				</div>
			</div>
		</>
	)
}
