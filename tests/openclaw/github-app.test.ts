/**
 * Unit tests for OpenClaw's GitHub App auth helpers. The signing function
 * is fully testable against a freshly-generated RSA keypair — no network,
 * no fixture .pem committed to the repo. Verifies that the JWT we emit
 * is RS256, has the GitHub-required claims, and is signature-verifiable
 * under the corresponding public key.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createVerify, generateKeyPairSync } from "node:crypto"

import { isAppAuthConfigured, signAppJwt } from "@/tools/openclaw/lib/github-app.mjs"

function makeKeypair() {
  return generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  })
}

function decodeJwtPart(part: string): unknown {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8"))
}

describe("signAppJwt", () => {
  it("emits a three-part RS256 JWT carrying the GitHub-required claims", () => {
    const { privateKey } = makeKeypair()
    const now = 1_700_000_000
    const jwt = signAppJwt({ appId: "12345", privateKeyPem: privateKey, now })
    const parts = jwt.split(".")
    expect(parts).toHaveLength(3)

    const header = decodeJwtPart(parts[0]) as Record<string, string>
    expect(header).toEqual({ alg: "RS256", typ: "JWT" })

    const payload = decodeJwtPart(parts[1]) as Record<string, number | string>
    expect(payload.iss).toBe("12345")
    // iat is backdated 60s for clock skew
    expect(payload.iat).toBe(now - 60)
    // exp is +10 minutes from `now` (GitHub max)
    expect(payload.exp).toBe(now + 600)
  })

  it("produces a signature that verifies under the corresponding public key", () => {
    const { privateKey, publicKey } = makeKeypair()
    const jwt = signAppJwt({ appId: "42", privateKeyPem: privateKey })
    const [headerB64, payloadB64, signatureB64] = jwt.split(".")
    const verifier = createVerify("RSA-SHA256")
    verifier.update(`${headerB64}.${payloadB64}`)
    verifier.end()
    const ok = verifier.verify(publicKey, Buffer.from(signatureB64, "base64url"))
    expect(ok).toBe(true)
  })

  it("does NOT verify under a different keypair (sanity check)", () => {
    const signer = makeKeypair()
    const stranger = makeKeypair()
    const jwt = signAppJwt({ appId: "1", privateKeyPem: signer.privateKey })
    const [headerB64, payloadB64, signatureB64] = jwt.split(".")
    const verifier = createVerify("RSA-SHA256")
    verifier.update(`${headerB64}.${payloadB64}`)
    verifier.end()
    expect(verifier.verify(stranger.publicKey, Buffer.from(signatureB64, "base64url"))).toBe(false)
  })

  it("rejects missing inputs with a clear error", () => {
    const { privateKey } = makeKeypair()
    expect(() =>
      signAppJwt({ appId: "", privateKeyPem: privateKey } as unknown as {
        appId: string
        privateKeyPem: string
      })
    ).toThrow(/appId/)
    expect(() =>
      signAppJwt({ appId: "1", privateKeyPem: "" } as unknown as {
        appId: string
        privateKeyPem: string
      })
    ).toThrow(/privateKey/)
  })
})

describe("isAppAuthConfigured", () => {
  const OG_ENV = { ...process.env }

  beforeEach(() => {
    delete process.env.OPENCLAW_APP_ID
    delete process.env.OPENCLAW_INSTALLATION_ID
    delete process.env.OPENCLAW_PRIVATE_KEY_PATH
    delete process.env.OPENCLAW_PRIVATE_KEY
  })

  afterEach(() => {
    // Restore in case other tests in the worker rely on env state.
    process.env = { ...OG_ENV }
  })

  it("returns false when no App env vars are set", () => {
    expect(isAppAuthConfigured()).toBe(false)
  })

  it("returns false when only some App env vars are set", () => {
    process.env.OPENCLAW_APP_ID = "1"
    expect(isAppAuthConfigured()).toBe(false)
    process.env.OPENCLAW_INSTALLATION_ID = "2"
    expect(isAppAuthConfigured()).toBe(false)
  })

  it("returns true when App ID + Installation ID + a key source are all present", () => {
    process.env.OPENCLAW_APP_ID = "1"
    process.env.OPENCLAW_INSTALLATION_ID = "2"
    process.env.OPENCLAW_PRIVATE_KEY_PATH = "/some/path.pem"
    expect(isAppAuthConfigured()).toBe(true)
  })

  it("accepts inline OPENCLAW_PRIVATE_KEY as the key source", () => {
    process.env.OPENCLAW_APP_ID = "1"
    process.env.OPENCLAW_INSTALLATION_ID = "2"
    process.env.OPENCLAW_PRIVATE_KEY = "-----BEGIN PRIVATE KEY----- ..."
    expect(isAppAuthConfigured()).toBe(true)
  })
})
