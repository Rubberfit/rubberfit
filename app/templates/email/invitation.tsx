import * as React from "react"
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface InvitationEmailProps {
  tenantName: string
  inviterName: string
  acceptUrl: string
  expiresAt: Date
  roles: string[]
  companyName: string
}

const InvitationEmail: React.FC<InvitationEmailProps> = ({
  tenantName,
  inviterName,
  acceptUrl,
  expiresAt,
  roles,
  companyName,
}) => {
  const previewText = `${inviterName} invited you to join ${tenantName} on ${companyName} RubberFit`
  const expiryDisplay = expiresAt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const roleList = roles.join(", ")

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You&apos;re invited to {tenantName}</Heading>

          <Text style={text}>
            <strong>{inviterName}</strong> has invited you to collaborate on{" "}
            <strong>{tenantName}</strong> in {companyName} RubberFit.
          </Text>

          <Section style={inviteBox}>
            <table style={table}>
              <tbody>
                <tr>
                  <td style={labelCell}>Workspace:</td>
                  <td style={valueCell}>{tenantName}</td>
                </tr>
                <tr>
                  <td style={labelCell}>Invited by:</td>
                  <td style={valueCell}>{inviterName}</td>
                </tr>
                <tr>
                  <td style={labelCell}>Role{roles.length === 1 ? "" : "s"}:</td>
                  <td style={valueCell}>{roleList}</td>
                </tr>
                <tr>
                  <td style={labelCell}>Expires:</td>
                  <td style={valueCell}>{expiryDisplay}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Section style={buttonContainer}>
            <Button style={acceptButton} href={acceptUrl}>
              Accept invitation
            </Button>
          </Section>

          <Text style={text}>
            Or paste this link into your browser:{" "}
            <Link href={acceptUrl} style={link}>
              {acceptUrl}
            </Link>
          </Text>

          <Text style={noteText}>
            <strong>Heads up:</strong> this invitation expires on {expiryDisplay}. If you
            weren&apos;t expecting it, you can safely ignore this email.
          </Text>

          <Hr style={divider} />

          <Text style={footer}>
            This is an automated notification from {companyName} RubberFit.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default InvitationEmail

const main = {
  backgroundColor: "#f8f9fa",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: "0 auto",
  padding: "40px 20px",
  width: "100%",
  maxWidth: "580px",
}

const h1 = {
  color: "#111827",
  fontSize: "24px",
  fontWeight: "600",
  lineHeight: "32px",
  margin: "0 0 20px",
}

const text = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 16px",
}

const inviteBox = {
  backgroundColor: "#ffffff",
  border: "2px solid #2563eb",
  borderRadius: "8px",
  padding: "24px",
  margin: "20px 0",
}

const table = {
  width: "100%",
  borderCollapse: "collapse" as const,
}

const labelCell = {
  color: "#6b7280",
  fontSize: "14px",
  padding: "8px 0",
  width: "140px",
}

const valueCell = {
  color: "#111827",
  fontSize: "14px",
  fontWeight: "500",
  padding: "8px 0",
}

const buttonContainer = {
  margin: "30px 0",
  textAlign: "center" as const,
}

const acceptButton = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  lineHeight: "48px",
  textAlign: "center" as const,
  textDecoration: "none",
  width: "220px",
}

const noteText = {
  backgroundColor: "#fef3c7",
  borderLeft: "4px solid #f59e0b",
  color: "#92400e",
  fontSize: "13px",
  lineHeight: "20px",
  padding: "12px 16px",
  margin: "20px 0",
}

const divider = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
}

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "20px 0 0",
}

const link = {
  color: "#2563eb",
  textDecoration: "underline",
  wordBreak: "break-all" as const,
}
