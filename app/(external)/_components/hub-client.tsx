"use client"

import Link from "next/link"
import { motion, useReducedMotion, type Variants } from "framer-motion"

export interface EntryPoint {
  label: string
  href: string
  kicker: string
  description: string
}

const ease = [0.22, 1, 0.36, 1] as const

const heroContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
}

const heroItem = (y: number, dur: number, del: number): Variants => ({
  hidden: { opacity: 0, y },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: dur, delay: del, ease },
  },
})

const rail: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.4 },
  },
}

const cardVariant: Variants = {
  hidden: { opacity: 0, x: 20 },
  show: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.7, ease },
  },
}

interface HubClientProps {
  entryPoints: EntryPoint[]
}

export function HubClient({ entryPoints }: HubClientProps) {
  const prefersReducedMotion = useReducedMotion()
  const shouldReduceMotion = prefersReducedMotion ?? false
  const initial = shouldReduceMotion ? false : "hidden"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-8 lg:px-10">
        <header className="relative flex items-center justify-between pb-5">
          <motion.div initial={initial} animate="show" variants={heroItem(-6, 0.5, 0)}>
            <Link href="/" className="flex items-center gap-3" aria-label="RubberFit home">
              <img src="/rubberfit-mark.svg" alt="" className="size-9" aria-hidden="true" />
              <span className="font-display text-lg font-semibold tracking-normal">RubberFit</span>
            </Link>
          </motion.div>
          <motion.div initial={initial} animate="show" variants={heroItem(-6, 0.5, 0)}>
            <Link
              href="/login"
              className="rounded-md border border-border-strong px-3 py-2 text-sm font-medium transition hover:bg-secondary"
            >
              Sign in
            </Link>
          </motion.div>

          <motion.div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0 h-px origin-left bg-border"
            initial={shouldReduceMotion ? { scaleX: 1 } : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease }}
          />
        </header>

        <div className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div initial={initial} animate="show" variants={heroContainer}>
            <motion.p
              variants={heroItem(14, 0.7, 0.1)}
              className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              Rubber manufacturing operations
            </motion.p>
            <motion.h1
              variants={heroItem(26, 0.85, 0.18)}
              className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-[0.95] tracking-normal text-foreground sm:text-6xl lg:text-7xl"
            >
              CRM, inventory, procurement, and nesting in one workflow.
            </motion.h1>
            <motion.p
              variants={heroItem(18, 0.7, 0.35)}
              className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg"
            >
              RubberFit gives rubber-roll fabricators one system for suppliers, stock, jobs, cut
              planning, audit history, and customer-ready output.
            </motion.p>
            <motion.div variants={heroItem(14, 0.6, 0.5)} className="mt-8 flex flex-wrap gap-3">
              <Link
                href="https://get.rubberfit.app"
                className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Explore RubberFit
              </Link>
            </motion.div>
          </motion.div>

          <motion.nav
            aria-label="RubberFit destinations"
            initial={initial}
            animate="show"
            variants={rail}
            className="relative grid gap-3"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-3 -top-3 select-none text-xl leading-none text-border"
            >
              ⌜
            </span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-3 -right-3 select-none text-xl leading-none text-border"
            >
              ⌟
            </span>

            {entryPoints.map((entry) => (
              <motion.div
                key={entry.href}
                variants={cardVariant}
                whileHover={shouldReduceMotion ? undefined : { y: -1 }}
              >
                <Link
                  href={entry.href}
                  className="group relative block overflow-hidden rounded-lg border border-border bg-card p-5 transition-colors hover:border-border-strong hover:bg-secondary"
                >
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 top-0 w-0.5 origin-top scale-y-0 bg-primary transition-transform duration-[250ms] group-hover:scale-y-100"
                  />
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {entry.kicker}
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-4 font-display text-2xl font-semibold tracking-normal">
                    {entry.label}
                    <span
                      className="text-primary transition group-hover:translate-x-1"
                      aria-hidden="true"
                    >
                      -&gt;
                    </span>
                  </span>
                  <span className="mt-3 block text-sm leading-6 text-muted-foreground">
                    {entry.description}
                  </span>
                </Link>
              </motion.div>
            ))}
          </motion.nav>
        </div>
      </section>
    </main>
  )
}
