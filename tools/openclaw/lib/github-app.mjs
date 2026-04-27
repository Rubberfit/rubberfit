/* eslint-env node */
// GitHub App authentication for OpenClaw.
//
// Authenticating as a GitHub App lets OpenClaw post comments under its own
// `@openclaw[bot]` identity rather than the developer's personal account.
//
// Flow:
//   1. Sign a short-lived JWT (10 min) with the App's private key (RS256).
//   2. Exchange the JWT at
//      `POST /app/installations/{id}/access_tokens` for an installation
//      access token (~1 hour TTL).
//   3. Use the installation token as `Authorization: token …` for any
//      `repos/...` REST calls — comment posts, issue updates, etc.
//
// Environment:
//   OPENCLAW_APP_ID            — numeric App ID from the App settings page
//   OPENCLAW_PRIVATE_KEY_PATH  — filesystem path to the downloaded `.pem`
//   OPENCLAW_INSTALLATION_ID   — numeric Installation ID (from the URL when
//                                you click "Install App" → "Configure")
//   OPENCLAW_PRIVATE_KEY       — alternative to PATH: the raw PEM contents
//                                (useful for CI/secret stores)
//
// All three values are required to use App auth. When any is missing the
// caller falls back to user auth via the gh CLI — see `getInstallationToken`.
import { readFile } from "node:fs/promises"
import { createSign } from "node:crypto"

const ENV_APP_ID = "OPENCLAW_APP_ID"
const ENV_KEY_PATH = "OPENCLAW_PRIVATE_KEY_PATH"
const ENV_KEY_INLINE = "OPENCLAW_PRIVATE_KEY"
const ENV_INSTALLATION_ID = "OPENCLAW_INSTALLATION_ID"

const JWT_TTL_SECONDS = 10 * 60 // GitHub caps App JWTs at 10 minutes
const JWT_SKEW_SECONDS = 60 // Backdate iat to absorb local-clock drift

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

/**
 * Sign a GitHub App JWT with the provided RSA private key (PEM-encoded).
 * Returns the compact JWT string. Algorithm is locked to RS256 — that's
 * what GitHub requires; HS256 / ES256 will be rejected.
 */
export function signAppJwt({ appId, privateKeyPem, now = Math.floor(Date.now() / 1000) }) {
  if (!appId) throw new Error("signAppJwt: missing appId")
  if (!privateKeyPem) throw new Error("signAppJwt: missing privateKeyPem")

  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iat: now - JWT_SKEW_SECONDS,
    exp: now + JWT_TTL_SECONDS,
    iss: String(appId),
  }
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const signer = createSign("RSA-SHA256")
  signer.update(signingInput)
  signer.end()
  const signature = base64UrlEncode(signer.sign(privateKeyPem))
  return `${signingInput}.${signature}`
}

/**
 * Resolve the App private key from env: prefers inline `OPENCLAW_PRIVATE_KEY`,
 * falls back to reading `OPENCLAW_PRIVATE_KEY_PATH` from disk. Returns null
 * when neither is set (caller should fall back to user auth).
 */
async function loadPrivateKey() {
  const inline = process.env[ENV_KEY_INLINE]
  if (inline && inline.includes("PRIVATE KEY")) return inline
  const path = process.env[ENV_KEY_PATH]
  if (!path) return null
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    throw new Error(`Failed to read OPENCLAW_PRIVATE_KEY_PATH (${path}): ${error.message}`)
  }
}

/**
 * Detect whether App auth is configured. Returns true when all three env
 * vars are present (App ID + key + installation id). The triage script
 * uses this to decide between bot identity and falling back to user auth.
 */
export function isAppAuthConfigured() {
  const hasKey = !!(process.env[ENV_KEY_PATH] || process.env[ENV_KEY_INLINE])
  return !!(process.env[ENV_APP_ID] && process.env[ENV_INSTALLATION_ID] && hasKey)
}

/**
 * Exchange an App JWT for an installation access token. The returned token
 * is a Bearer credential — use it as `Authorization: token <value>` for
 * any `/repos/...` API call. TTL is ~1 hour; we don't bother caching since
 * each triage run is a single short batch of API calls.
 */
export async function getInstallationToken({ fetchImpl = fetch } = {}) {
  const appId = process.env[ENV_APP_ID]
  const installationId = process.env[ENV_INSTALLATION_ID]
  const privateKey = await loadPrivateKey()
  if (!appId || !installationId || !privateKey) {
    return null
  }
  const jwt = signAppJwt({ appId, privateKeyPem: privateKey })
  const res = await fetchImpl(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28",
      },
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `GitHub installation token exchange failed (HTTP ${res.status}): ${body.slice(0, 300)}`
    )
  }
  const json = await res.json()
  if (typeof json.token !== "string") {
    throw new Error("Installation token response missing 'token' field")
  }
  return json.token
}
