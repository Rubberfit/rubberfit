// Side-effect-only module that ensures Vercel's `@vercel/nft` tracer
// includes every `@swc/helpers/esm/*.js` helper file in the lambda
// bundle.
//
// Background: starting at @swc/helpers 0.5.17, the package's `exports`
// map exposes only subpath aliases (`./_/_interop_require_default`,
// etc.) — there is no `./esm/*` entry. Next.js's SWC-compiled output
// for our middleware (and several route handlers) emits raw file-path
// requires like
//
//   require('@swc/helpers/esm/_interop_require_default.js')
//
// nft sees those requires but cannot resolve them through the exports
// map and DOES NOT include the underlying files in the lambda. At
// runtime every preview deployment crashes with
//
//   Cannot find module
//   '/var/task/node_modules/@swc/helpers/esm/_interop_require_default.js'
//
// on the first request that hits middleware or a Node-runtime route.
//
// Fix: explicit subpath imports below resolve cleanly through the
// exports map AND pin the underlying ./esm/*.js targets into the
// nft trace. Production (deployed before this regression surfaced)
// has the same package shape but its lambda was packaged at a time
// when Vercel's nft was more permissive — re-deploying production
// would hit the same bug without this pin.
//
// Importing this file from any code path that ends up in a lambda
// (middleware, route handlers, server components) is sufficient. We
// import it from `proxy.ts` (covers middleware) and `app/layout.tsx`
// or another universal entry (covers route lambdas).
//
// The imports below are SIDE EFFECTS only — we discard the bindings.
// Listed in a single statement per helper because tree-shaking on
// side-effect-free packages would strip them otherwise.

import "@swc/helpers/_/_interop_require_default"
import "@swc/helpers/_/_interop_require_wildcard"
import "@swc/helpers/_/_to_consumable_array"
import "@swc/helpers/_/_array_with_holes"
import "@swc/helpers/_/_array_without_holes"
import "@swc/helpers/_/_iterable_to_array"
import "@swc/helpers/_/_non_iterable_spread"
import "@swc/helpers/_/_define_property"
import "@swc/helpers/_/_object_spread"
import "@swc/helpers/_/_object_spread_props"
import "@swc/helpers/_/_class_call_check"
import "@swc/helpers/_/_create_class"
import "@swc/helpers/_/_async_to_generator"
import "@swc/helpers/_/_ts_generator"
import "@swc/helpers/_/_extends"
import "@swc/helpers/_/_assert_this_initialized"
import "@swc/helpers/_/_get"
import "@swc/helpers/_/_inherits"
import "@swc/helpers/_/_create_super"
import "@swc/helpers/_/_possible_constructor_return"

export {}
