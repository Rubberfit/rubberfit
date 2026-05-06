"use client"

import { motion, useReducedMotion, type Variants } from "framer-motion"

/**
 * Right-pane illustration on the auth surface. Miniature P&ID column
 *   — Roll → Cut → Offcut with a signal-orange return rail.
 *
 * Animation choreography (per Kimi's brief):
 *   - t=0   spec stamps render at full opacity (paper, not performance)
 *   - t=0   graphite backbone + dimension brackets draw via pathLength
 *   - t=0.2 station labels stagger in (3 px y nudge)
 *   - t=0.45 nodes scale in (ROLL → CUT → OFFCUT, 0.15 s stagger)
 *   - t=0.6 inner detail geometry fades (concentric / X / square)
 *   - t=0.8 orange return rail draws via pathLength (1.1 s, hero motion)
 *   - t=1.7 arrowhead snaps in (backOut)
 *   - t=2.3 entrance complete; one signal dot now traverses the rail
 *           every 8 s (linear, 2 s repeatDelay) — ambient proof-of-flow
 *
 * `prefers-reduced-motion: reduce` short-circuits to the final frame
 * with no animation at all (no entrance, no continuous loop).
 */

const EASE = [0.22, 1, 0.36, 1] as const

const labelGroupVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } },
}

const labelVariants: Variants = {
  hidden: { opacity: 0, y: 3 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
}

const nodeGroupVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.45 } },
}

const nodeVariants: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: EASE } },
}

const detailVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, delay: 0.15 } },
}

const backboneVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 0.25,
    transition: {
      pathLength: { duration: 0.7, ease: EASE },
      opacity: { duration: 0.2 },
    },
  },
}

const dimVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 0.3,
    transition: {
      pathLength: { duration: 0.5, ease: EASE, delay: 0.1 },
      opacity: { duration: 0.2, delay: 0.1 },
    },
  },
}

const railVariants: Variants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: {
    pathLength: 1,
    opacity: 0.95,
    transition: {
      pathLength: { duration: 1.1, ease: EASE, delay: 0.8 },
      opacity: { duration: 0.3, delay: 0.8 },
    },
  },
}

const arrowVariants: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  visible: {
    opacity: 0.95,
    scale: 1,
    transition: { duration: 0.2, ease: "backOut", delay: 1.6 },
  },
}

const dimensionLabelVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, delay: 0.4 } },
}

export function AuthDrawing() {
  const reduced = useReducedMotion()

  return (
    <motion.svg
      viewBox="0 0 320 520"
      fill="none"
      className="auth-illustration"
      role="img"
      aria-label="Rubberfit closed-loop schematic"
      initial={reduced ? "visible" : "hidden"}
      animate="visible"
    >
      {/* ── Spec stamps (document chrome — never animated) ── */}
      <text
        x={20}
        y={28}
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={10}
        letterSpacing="0.05em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        FIG. 7-A
      </text>
      <text
        x={20}
        y={42}
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={10}
        letterSpacing="0.05em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        REV. 2026.05
      </text>
      <text
        x={300}
        y={28}
        textAnchor="end"
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={10}
        letterSpacing="0.05em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        SCALE 1:4
      </text>
      <text
        x={300}
        y={510}
        textAnchor="end"
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={10}
        letterSpacing="0.05em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        SHEET 1 OF 1
      </text>

      {/* ── Station labels ── */}
      <motion.g variants={labelGroupVariants}>
        <motion.text
          x={160}
          y={75}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
          fontSize={10}
          letterSpacing="0.18em"
          className="auth-illustration-stamp"
          fill="#8a8f97"
          variants={labelVariants}
        >
          ROLL
        </motion.text>
        <motion.text
          x={160}
          y={235}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
          fontSize={10}
          letterSpacing="0.18em"
          className="auth-illustration-stamp"
          fill="#8a8f97"
          variants={labelVariants}
        >
          CUT
        </motion.text>
        <motion.text
          x={160}
          y={395}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
          fontSize={10}
          letterSpacing="0.18em"
          className="auth-illustration-stamp"
          fill="#8a8f97"
          variants={labelVariants}
        >
          OFFCUT
        </motion.text>
      </motion.g>

      {/* ── Backbone (faint construction spine) ── */}
      <motion.path
        d="M 160 120 L 160 240 M 160 280 L 160 400"
        className="auth-illustration-faint"
        stroke="#14171b"
        strokeWidth={1}
        variants={backboneVariants}
      />

      {/* ── Nodes (with internal detail) ── */}
      <motion.g variants={nodeGroupVariants}>
        <motion.g
          variants={nodeVariants}
          style={{ transformOrigin: "160px 100px", transformBox: "fill-box" }}
        >
          <circle
            cx={160}
            cy={100}
            r={20}
            stroke="#14171b"
            strokeWidth={1}
            className="auth-illustration-stroke"
            opacity={0.4}
            fill="none"
          />
          <motion.circle
            cx={160}
            cy={100}
            r={8}
            stroke="#14171b"
            strokeWidth={1}
            className="auth-illustration-stroke"
            opacity={0.4}
            fill="none"
            variants={detailVariants}
          />
        </motion.g>

        <motion.g
          variants={nodeVariants}
          style={{ transformOrigin: "160px 260px", transformBox: "fill-box" }}
        >
          <circle
            cx={160}
            cy={260}
            r={20}
            stroke="#14171b"
            strokeWidth={1}
            className="auth-illustration-stroke"
            opacity={0.4}
            fill="none"
          />
          <motion.g variants={detailVariants}>
            <line
              x1={146}
              y1={246}
              x2={174}
              y2={274}
              stroke="#14171b"
              strokeWidth={1}
              className="auth-illustration-stroke"
              opacity={0.4}
            />
            <line
              x1={174}
              y1={246}
              x2={146}
              y2={274}
              stroke="#14171b"
              strokeWidth={1}
              className="auth-illustration-stroke"
              opacity={0.4}
            />
          </motion.g>
        </motion.g>

        <motion.g
          variants={nodeVariants}
          style={{ transformOrigin: "160px 420px", transformBox: "fill-box" }}
        >
          <circle
            cx={160}
            cy={420}
            r={20}
            stroke="#14171b"
            strokeWidth={1}
            className="auth-illustration-stroke"
            opacity={0.4}
            fill="none"
          />
          <motion.rect
            x={154}
            y={414}
            width={12}
            height={12}
            stroke="#14171b"
            strokeWidth={1}
            className="auth-illustration-stroke"
            opacity={0.4}
            fill="none"
            variants={detailVariants}
          />
        </motion.g>
      </motion.g>

      {/* ── Dimension brackets ── */}
      <motion.g variants={dimVariants}>
        <line
          x1={80}
          y1={100}
          x2={140}
          y2={100}
          className="auth-illustration-faint"
          stroke="#14171b"
          strokeWidth={1}
        />
        <line
          x1={80}
          y1={260}
          x2={140}
          y2={260}
          className="auth-illustration-faint"
          stroke="#14171b"
          strokeWidth={1}
        />
        <line
          x1={80}
          y1={420}
          x2={140}
          y2={420}
          className="auth-illustration-faint"
          stroke="#14171b"
          strokeWidth={1}
        />
        <line
          x1={80}
          y1={100}
          x2={80}
          y2={420}
          className="auth-illustration-faint"
          stroke="#14171b"
          strokeWidth={1}
        />
      </motion.g>

      <motion.text
        x={70}
        y={265}
        textAnchor="end"
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={9}
        letterSpacing="0.05em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
        variants={dimensionLabelVariants}
      >
        H = 320
      </motion.text>

      {/* ── Signal-orange return rail (hero motion) ── */}
      <motion.path
        d="M 180 420 L 224 420 L 224 100 L 180 100"
        stroke="#ee5a24"
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        variants={railVariants}
      />

      <motion.polygon
        points="180,100 188,109 172,109"
        fill="#ee5a24"
        variants={arrowVariants}
        style={{ transformOrigin: "180px 105px", transformBox: "fill-box" }}
      />

      {/* ── Continuous flow dot — single status light tracing the rail ── */}
      {!reduced ? (
        <motion.circle
          r={2.5}
          fill="#ee5a24"
          initial={{ opacity: 0, cx: 224, cy: 420 }}
          animate={{
            cx: [224, 224, 224, 180],
            cy: [420, 420, 100, 100],
            opacity: [0, 0.85, 0.85, 0],
          }}
          transition={{
            duration: 8,
            ease: "linear",
            times: [0, 0.05, 0.92, 1],
            repeat: Infinity,
            repeatDelay: 2,
            delay: 2.3,
          }}
        />
      ) : null}
    </motion.svg>
  )
}
