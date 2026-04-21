import { redirect } from "next/navigation"

/**
 * Legacy scan entrypoint. Old printed labels point at `/r/<part>`.
 * We now serve a PDF directly from `/r/<part>/pdf`, so keep this
 * page as a lightweight redirect instead of a web landing screen.
 */

interface PageProps {
  params: Promise<{ partNumber: string }>
}

export default async function RollScanPage({ params }: PageProps) {
  const { partNumber } = await params
  redirect(`/r/${encodeURIComponent(partNumber)}/pdf`)
}
