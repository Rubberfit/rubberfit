import { describe, expect, it } from "vitest"

import {
  createUserWithProfile,
  listDirectoryUsers,
} from "@/src/infrastructure/services/userManagementService"
import { makeFakeClient } from "@/tests/helpers/fake-supabase-client"

describe("listDirectoryUsers", () => {
  it("returns the directory rows", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: {
            data: [
              { id: "u1", full_name: "Alice", email: "alice@x.com" },
              { id: "u2", full_name: "Bob", email: "bob@x.com" },
            ],
            error: null,
          },
        },
      },
    })
    const users = await listDirectoryUsers(client)
    expect(users.map((u) => u.id)).toEqual(["u1", "u2"])
  })
})

describe("createUserWithProfile", () => {
  it("rejects with 409 when the email already exists", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: { data: [{ id: "existing" }], error: null },
        },
      },
    })
    const result = await createUserWithProfile(client, {
      email: "alice@x.com",
      password: "supersecret",
      fullName: "Alice",
      roles: ["member"],
    })
    expect(result).toEqual({ ok: false, status: 409, error: expect.any(String) })
  })

  it("returns the userId on a clean create", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: { data: null, error: null },
          update: { data: { id: "new-uid" }, error: null },
        },
      },
      auth: {
        admin: {
          createUser: { data: { user: { id: "new-uid" } }, error: null },
        },
      },
    })
    const result = await createUserWithProfile(client, {
      email: "alice@x.com",
      password: "supersecret",
      fullName: "Alice",
      roles: ["admin", "manager"],
    })
    expect(result).toEqual({ ok: true, userId: "new-uid" })
  })

  it("returns warning when the profile row is missing (silent 0-row update)", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: { data: null, error: null },
          update: { data: null, error: null },
        },
      },
      auth: {
        admin: {
          createUser: { data: { user: { id: "new-uid" } }, error: null },
        },
      },
    })
    const result = await createUserWithProfile(client, {
      email: "alice@x.com",
      password: "supersecret",
      fullName: "Alice",
      roles: ["member"],
    })
    expect(result).toMatchObject({
      ok: true,
      userId: "new-uid",
      warning: expect.any(String),
    })
  })

  it("returns warning + userId when profile update fails (user was still created)", async () => {
    const client = makeFakeClient({
      tables: {
        profiles: {
          select: { data: null, error: null },
          update: { data: null, error: { message: "constraint" } },
        },
      },
      auth: {
        admin: {
          createUser: { data: { user: { id: "new-uid" } }, error: null },
        },
      },
    })
    const result = await createUserWithProfile(client, {
      email: "alice@x.com",
      password: "supersecret",
      fullName: "Alice",
      roles: ["member"],
    })
    expect(result).toMatchObject({
      ok: true,
      userId: "new-uid",
      warning: expect.any(String),
    })
  })

  it("returns 400 when auth.admin.createUser errors", async () => {
    const client = makeFakeClient({
      tables: { profiles: { select: { data: null, error: null } } },
      auth: {
        admin: {
          createUser: {
            data: { user: null },
            error: { message: "weak password" },
          },
        },
      },
    })
    const result = await createUserWithProfile(client, {
      email: "alice@x.com",
      password: "short",
      fullName: "Alice",
      roles: ["member"],
    })
    expect(result).toEqual({ ok: false, status: 400, error: "weak password" })
  })
})
