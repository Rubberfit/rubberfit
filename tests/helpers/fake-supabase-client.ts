import { vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Lightweight chainable fake of the Supabase query builder. Tests use
 * it to stub the data + error returned from a `.from(table)` chain
 * without pulling a real Supabase client.
 *
 * Usage:
 *   const client = makeFakeClient({
 *     "cut_history": {
 *       select: { data: [{ id: "abc" }], error: null },
 *     },
 *     "rolls": {
 *       insert: { data: null, error: null },
 *     },
 *   })
 *
 * The fake returns the same chainable proxy for `.select`, `.update`,
 * `.delete`, `.insert`, `.eq`, `.neq`, `.in`, `.order`, `.range`,
 * `.gte`, `.lte`, `.limit`, `.schema` so test code can express any
 * query shape. Terminal `.maybeSingle()` / `.single()` / `await chain`
 * resolve to the configured result for the matching verb.
 */
export type FakeQueryResult<T = unknown> = { data: T; error: unknown }

export interface FakeTableConfig {
  select?: FakeQueryResult
  insert?: FakeQueryResult
  update?: FakeQueryResult
  delete?: FakeQueryResult
}

export interface FakeRpcConfig {
  [name: string]: FakeQueryResult
}

export interface FakeStorageConfig {
  upload?: { data?: unknown; error?: unknown }
  getPublicUrl?: { data: { publicUrl: string } }
  listBuckets?: FakeQueryResult
}

export interface FakeAuthConfig {
  getUser?: { data: { user: unknown } }
  admin?: {
    createUser?: { data: { user: { id: string } | null }; error: unknown }
    listUsers?: FakeQueryResult
  }
}

export interface FakeClientConfig {
  tables?: Record<string, FakeTableConfig>
  rpcs?: FakeRpcConfig
  storage?: Record<string, FakeStorageConfig>
  auth?: FakeAuthConfig
  schemas?: Record<string, Record<string, FakeTableConfig>>
}

interface QueryHandle {
  table: string
  schema: string | null
  verb: keyof FakeTableConfig
}

function makeQuery(handle: QueryHandle, config: FakeClientConfig) {
  const tableCfg = handle.schema
    ? config.schemas?.[handle.schema]?.[handle.table]
    : config.tables?.[handle.table]

  // Track the FIRST mutating verb in the chain. `.insert(...).select()`
  // is conventionally a returning-insert — we want the `insert` config
  // to drive the result, not the trailing `.select()`. So `.select`
  // doesn't overwrite a previously-set mutating verb.
  function setVerb(v: keyof FakeTableConfig) {
    if (v === "select" && handle.verb !== "select") return
    handle.verb = v
  }

  const proxy = {
    select: vi.fn(() => {
      setVerb("select")
      return proxy
    }),
    insert: vi.fn(() => {
      setVerb("insert")
      return proxy
    }),
    update: vi.fn(() => {
      setVerb("update")
      return proxy
    }),
    delete: vi.fn(() => {
      setVerb("delete")
      return proxy
    }),
    upsert: vi.fn(() => {
      setVerb("insert")
      return proxy
    }),
    eq: vi.fn(() => proxy),
    neq: vi.fn(() => proxy),
    in: vi.fn(() => proxy),
    is: vi.fn(() => proxy),
    or: vi.fn(() => proxy),
    order: vi.fn(() => proxy),
    range: vi.fn(() => proxy),
    gte: vi.fn(() => proxy),
    lte: vi.fn(() => proxy),
    limit: vi.fn(() => proxy),
    maybeSingle: vi.fn(() => {
      const result = tableCfg?.[handle.verb] ?? { data: null, error: null }
      return Promise.resolve(unwrap(result, "single"))
    }),
    single: vi.fn(() => {
      const result = tableCfg?.[handle.verb] ?? { data: null, error: null }
      return Promise.resolve(unwrap(result, "single"))
    }),
    then: (resolve: (v: FakeQueryResult) => unknown, reject?: (err: unknown) => unknown) => {
      const result = tableCfg?.[handle.verb] ?? { data: null, error: null }
      return Promise.resolve(toCount(result, tableCfg)).then(resolve, reject)
    },
  }
  return proxy
}

function unwrap(result: FakeQueryResult, shape: "list" | "single"): FakeQueryResult {
  if (shape === "single") {
    if (Array.isArray(result.data)) {
      return { data: result.data[0] ?? null, error: result.error }
    }
    return result
  }
  return result
}

function toCount(result: FakeQueryResult, _cfg: FakeTableConfig | undefined) {
  // Tests that need a count can encode it on the data array length.
  if (Array.isArray(result.data)) {
    return { ...result, count: result.data.length }
  }
  return { ...result, count: 0 }
}

export function makeFakeClient(config: FakeClientConfig = {}): SupabaseClient {
  const fake = {
    from(table: string) {
      const handle: QueryHandle = { table, schema: null, verb: "select" }
      return makeQuery(handle, config)
    },
    schema(schemaName: string) {
      return {
        from(table: string) {
          const handle: QueryHandle = { table, schema: schemaName, verb: "select" }
          return makeQuery(handle, config)
        },
      }
    },
    rpc(name: string, _args?: unknown) {
      return Promise.resolve(config.rpcs?.[name] ?? { data: null, error: null })
    },
    storage: {
      from(bucket: string) {
        const cfg = config.storage?.[bucket] ?? {}
        return {
          upload: vi.fn(() =>
            Promise.resolve({
              data: cfg.upload?.data ?? { path: "fake" },
              error: cfg.upload?.error ?? null,
            })
          ),
          getPublicUrl: vi.fn(
            () => cfg.getPublicUrl ?? { data: { publicUrl: "https://fake/url" } }
          ),
        }
      },
      listBuckets: vi.fn(() =>
        Promise.resolve(
          (config.storage?.["__root"]?.listBuckets as FakeQueryResult | undefined) ?? {
            data: [],
            error: null,
          }
        )
      ),
    },
    auth: {
      getUser: vi.fn(() => Promise.resolve(config.auth?.getUser ?? { data: { user: null } })),
      admin: {
        createUser: vi.fn((_args: unknown) =>
          Promise.resolve(
            config.auth?.admin?.createUser ?? {
              data: { user: { id: "fake-user-id" } },
              error: null,
            }
          )
        ),
        listUsers: vi.fn(() =>
          Promise.resolve(config.auth?.admin?.listUsers ?? { data: { users: [] }, error: null })
        ),
      },
    },
  }
  return fake as unknown as SupabaseClient
}
