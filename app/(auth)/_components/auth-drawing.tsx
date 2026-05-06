/**
 * Right-pane illustration on the auth surface. Miniature P&ID column
 * — Roll → Cut → Offcut with a signal-orange return rail. Uses CSS
 *   classes so the strokes invert correctly in dark mode.
 */
export function AuthDrawing() {
  return (
    <svg
      viewBox="0 0 320 520"
      fill="none"
      className="auth-illustration"
      role="img"
      aria-label="Rubberfit closed-loop schematic"
    >
      {/* Spec-sheet stamps */}
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

      {/* Station labels */}
      <text
        x={160}
        y={75}
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={10}
        letterSpacing="0.18em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        ROLL
      </text>
      <text
        x={160}
        y={235}
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={10}
        letterSpacing="0.18em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        CUT
      </text>
      <text
        x={160}
        y={395}
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={10}
        letterSpacing="0.18em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        OFFCUT
      </text>

      {/* Nodes */}
      <g
        className="auth-illustration-stroke"
        stroke="#14171b"
        strokeWidth={1}
        fill="none"
        opacity={0.4}
      >
        <circle cx={160} cy={100} r={20} />
        <circle cx={160} cy={100} r={8} />
        <circle cx={160} cy={260} r={20} />
        <line x1={146} y1={246} x2={174} y2={274} />
        <line x1={174} y1={246} x2={146} y2={274} />
        <circle cx={160} cy={420} r={20} />
        <rect x={154} y={414} width={12} height={12} />
      </g>

      {/* Backbone connector */}
      <line
        x1={160}
        y1={120}
        x2={160}
        y2={240}
        className="auth-illustration-faint"
        stroke="#14171b"
        strokeWidth={1}
        opacity={0.25}
      />
      <line
        x1={160}
        y1={280}
        x2={160}
        y2={400}
        className="auth-illustration-faint"
        stroke="#14171b"
        strokeWidth={1}
        opacity={0.25}
      />

      {/* Signal-orange return rail */}
      <path
        d="M 180 420 L 224 420 L 224 100 L 180 100"
        stroke="#ee5a24"
        strokeWidth={1.5}
        opacity={0.95}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points="180,100 188,109 172,109"
        fill="#ee5a24"
        opacity={0.95}
      />

      {/* Dimension brackets */}
      <line
        x1={80}
        y1={100}
        x2={140}
        y2={100}
        className="auth-illustration-faint"
        stroke="#14171b"
        strokeWidth={1}
        opacity={0.3}
      />
      <line
        x1={80}
        y1={260}
        x2={140}
        y2={260}
        className="auth-illustration-faint"
        stroke="#14171b"
        strokeWidth={1}
        opacity={0.3}
      />
      <line
        x1={80}
        y1={420}
        x2={140}
        y2={420}
        className="auth-illustration-faint"
        stroke="#14171b"
        strokeWidth={1}
        opacity={0.3}
      />
      <line
        x1={80}
        y1={100}
        x2={80}
        y2={420}
        className="auth-illustration-faint"
        stroke="#14171b"
        strokeWidth={1}
        opacity={0.3}
      />

      <text
        x={70}
        y={265}
        textAnchor="end"
        fontFamily="ui-monospace, SFMono-Regular, 'JetBrains Mono', Menlo, monospace"
        fontSize={9}
        letterSpacing="0.05em"
        className="auth-illustration-stamp"
        fill="#8a8f97"
      >
        H = 320
      </text>
    </svg>
  )
}
