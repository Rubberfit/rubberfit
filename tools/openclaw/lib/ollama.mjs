// Thin Ollama HTTP client wrapper. Hits the host configured by OLLAMA_HOST
// (default: http://192.168.50.68:11434 — the Windows GPU box on the LAN).
// Cloud-routed models (`*:cloud` tags) flow through this same gateway.
import { setTimeout as sleep } from "node:timers/promises"

const DEFAULT_HOST = "http://192.168.50.68:11434"

export function getOllamaHost() {
  return process.env.OLLAMA_HOST ?? DEFAULT_HOST
}

/**
 * Generate a single non-streamed response from the configured model.
 *
 * @param {object} args
 * @param {string} args.model      Model tag, e.g. 'glm-5.1:cloud'
 * @param {string} args.prompt     Full prompt (system + user, builder concatenated)
 * @param {number} [args.temperature]
 * @param {number} [args.timeoutMs]
 * @param {number} [args.retries]
 */
export async function generate({
  model,
  prompt,
  temperature = 0.2,
  // 5 minutes covers large prompts on cloud models (e.g. CR triage with
  // 20+ inline comments + retrieved chunks). The 2-minute default kept
  // aborting under PR #146-scale backlogs.
  timeoutMs = 300_000,
  // Default to no retries — for triage scripts a silent retry on the same
  // big prompt usually just doubles the wait before the operator sees the
  // real failure. Callers that genuinely benefit from retry (transient
  // network blip on a small embedder call) can opt in.
  retries = 0,
}) {
  const host = getOllamaHost()
  const url = `${host.replace(/\/$/, "")}/api/generate`
  const body = JSON.stringify({
    model,
    prompt,
    stream: false,
    options: { temperature },
  })

  // Cloud-routed models occasionally return 5xx during transient routing
  // hiccups (e.g. provider-side rate limits). We always retry those once
  // with a brief backoff regardless of the configured `retries` count;
  // the alternative is a daemon stall waiting for a clean tick.
  const TRANSIENT_RETRIES = 2
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    let transientAttempt = 0
    while (true) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (!res.ok) {
          const text = await res.text()
          // Retry transient upstream failures (502/503/504) with backoff.
          if (res.status >= 500 && transientAttempt < TRANSIENT_RETRIES) {
            transientAttempt += 1
            const delayMs = 5_000 * transientAttempt
            console.warn(
              `[ollama] HTTP ${res.status} from ${model}; retrying in ${delayMs / 1000}s (transient ${transientAttempt}/${TRANSIENT_RETRIES})`
            )
            await sleep(delayMs)
            continue
          }
          throw new Error(`Ollama HTTP ${res.status}: ${text}`)
        }
        const json = await res.json()
        if (typeof json.response !== "string") {
          throw new Error(
            `Ollama response missing 'response' field: ${JSON.stringify(json).slice(0, 200)}`
          )
        }
        return json.response
      } catch (error) {
        clearTimeout(timer)
        lastError = error
        // Break out of the transient retry loop on non-5xx errors so the
        // outer `retries` loop can decide whether to retry from scratch.
        break
      }
    }
    if (attempt < retries) {
      await sleep(1_000 * (attempt + 1))
      continue
    }
  }
  throw lastError ?? new Error("Ollama generate failed without error")
}

/**
 * Verify the configured model is available on the host. Cheap pre-flight
 * check — the script bails early if you typo the model name.
 *
 * Tag tolerance: `ollama pull nomic-embed-text` stores the model as
 * `nomic-embed-text:latest`. If the caller asked for an untagged name,
 * accept the `:latest` variant rather than failing on exact-match.
 */
export async function ensureModelAvailable(model) {
  const host = getOllamaHost()
  const res = await fetch(`${host.replace(/\/$/, "")}/api/tags`)
  if (!res.ok) {
    throw new Error(`Cannot reach Ollama at ${host} (HTTP ${res.status})`)
  }
  const json = await res.json()
  const names = (json.models ?? []).map((m) => m.name)
  if (names.includes(model)) return
  if (!model.includes(":") && names.includes(`${model}:latest`)) return
  const sample = names.slice(0, 8).join(", ")
  throw new Error(
    `Model '${model}' not found at ${host}. Available: ${sample}${names.length > 8 ? ", …" : ""}`
  )
}
