import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface HealthAlertEmailProps {
  serviceName: string
  status: "down" | "degraded"
  detail: string
  responseMs: number | null
  checkedAt: string
  dashboardUrl: string
}

export function HealthAlertEmail({
  serviceName,
  status,
  detail,
  responseMs,
  checkedAt,
  dashboardUrl,
}: HealthAlertEmailProps) {
  const isDown = status === "down"
  const accentColor = isDown ? "#ef4444" : "#f59e0b"
  const statusLabel = isDown ? "Down" : "Degraded"
  const emoji = isDown ? "🔴" : "🟡"

  const formattedTime = new Date(checkedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })

  return (
    <Html>
      <Head />
      <Preview>
        {emoji} {serviceName} is {statusLabel} — rema-portal
      </Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={{ borderLeft: `4px solid ${accentColor}`, paddingLeft: 16 }}>
            <Heading style={{ ...headingStyle, color: accentColor }}>
              {emoji} {serviceName} is {statusLabel}
            </Heading>
          </Section>

          <Hr style={hrStyle} />

          <Section>
            <Text style={labelStyle}>Service</Text>
            <Text style={valueStyle}>{serviceName}</Text>

            <Text style={labelStyle}>Status</Text>
            <Text style={{ ...valueStyle, color: accentColor, fontWeight: 600 }}>
              {statusLabel}
            </Text>

            <Text style={labelStyle}>Detail</Text>
            <Text style={valueStyle}>{detail}</Text>

            {responseMs !== null && (
              <>
                <Text style={labelStyle}>Response Time</Text>
                <Text style={valueStyle}>{responseMs}ms</Text>
              </>
            )}

            <Text style={labelStyle}>Detected At</Text>
            <Text style={valueStyle}>{formattedTime} UTC</Text>
          </Section>

          <Hr style={hrStyle} />

          <Section style={{ textAlign: "center" as const }}>
            <Button href={dashboardUrl} style={buttonStyle}>
              View Health Dashboard
            </Button>
          </Section>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>
            This alert was generated automatically by rema-portal health monitoring.
            You are receiving this because you are listed as an admin alert recipient.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const bodyStyle = {
  backgroundColor: "#0f0f0f",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0,
  padding: "32px 0",
}

const containerStyle = {
  backgroundColor: "#18181b",
  borderRadius: 8,
  border: "1px solid #27272a",
  maxWidth: 560,
  margin: "0 auto",
  padding: "32px 40px",
}

const headingStyle = {
  fontSize: 22,
  fontWeight: 700,
  margin: "0 0 4px 0",
}

const hrStyle = {
  borderColor: "#27272a",
  margin: "20px 0",
}

const labelStyle = {
  color: "#71717a",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  margin: "16px 0 2px 0",
}

const valueStyle = {
  color: "#e4e4e7",
  fontSize: 14,
  margin: "0 0 0 0",
}

const buttonStyle = {
  backgroundColor: "#3f3f46",
  borderRadius: 6,
  color: "#e4e4e7",
  fontSize: 14,
  fontWeight: 600,
  padding: "10px 24px",
  textDecoration: "none",
  display: "inline-block",
}

const footerStyle = {
  color: "#52525b",
  fontSize: 12,
  textAlign: "center" as const,
  margin: 0,
}

export default HealthAlertEmail
