import { getRubberFitEmailLogoPng } from "@/lib/auth-email-logo";

export const runtime = "nodejs";

export async function GET() {
  const body = getRubberFitEmailLogoPng();

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": body.byteLength.toString(),
      "Content-Type": "image/png",
      "Content-Disposition": 'inline; filename="auth-email-logo.png"',
    },
  });
}
