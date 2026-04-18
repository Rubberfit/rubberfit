// Vitest global setup — runs before each test file is evaluated.
//
// Loads .env.local so infrastructure modules that read process.env at import
// time (e.g. src/infrastructure/models/supabase.ts) succeed under Vitest.
// Without this, any test that transitively imports the DI registration chain
// would fail during module evaluation with "Missing Supabase environment
// variables."
import { config as loadDotenv } from "dotenv"
import path from "node:path"

loadDotenv({ path: path.resolve(__dirname, "../.env.local") })
