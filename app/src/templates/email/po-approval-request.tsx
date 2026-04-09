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

interface POApprovalRequestEmailProps {
  poNumber: string
  supplier: string
  totalAmount: number
  itemCount: number
  requestedBy: string
  approvalUrl: string
  companyName: string
}

const POApprovalRequestEmail: React.FC<POApprovalRequestEmailProps> = ({
  poNumber,
  supplier,
  totalAmount,
  itemCount,
  requestedBy,
  approvalUrl,
  companyName,
}) => {
  const previewText = `Approval required for PO ${poNumber}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>📋 Purchase Order Approval Required</Heading>

          <Text style={text}>A purchase order requires your approval:</Text>

          <Section style={poBox}>
            <Text style={poNumberStyle}>PO #{poNumber}</Text>
            <Hr style={divider} />

            <table style={table}>
              <tbody>
                <tr>
                  <td style={labelCell}>Supplier:</td>
                  <td style={valueCell}>{supplier}</td>
                </tr>
                <tr>
                  <td style={labelCell}>Total Amount:</td>
                  <td style={amountCell}>
                    $
                    {totalAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
                <tr>
                  <td style={labelCell}>Items:</td>
                  <td style={valueCell}>
                    {itemCount} line item{itemCount !== 1 ? "s" : ""}
                  </td>
                </tr>
                <tr>
                  <td style={labelCell}>Requested By:</td>
                  <td style={valueCell}>{requestedBy}</td>
                </tr>
                <tr>
                  <td style={labelCell}>Date:</td>
                  <td style={valueCell}>{new Date().toLocaleDateString()}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Text style={text}>
            Please review the purchase order details and approve or reject the request.
          </Text>

          <Section style={buttonContainer}>
            <Button style={approveButton} href={approvalUrl}>
              Review & Approve
            </Button>
          </Section>

          <Text style={noteText}>
            <strong>Note:</strong> This purchase order will remain pending until approved. You can
            also review it later in the Rema Portal application.
          </Text>

          <Hr style={divider} />

          <Text style={footer}>
            This is an automated notification from {companyName} Rema Portal.
            <br />
            To manage your notification preferences, visit your{" "}
            <Link href={`${process.env.NEXT_PUBLIC_APP_URL}/settings/notifications`} style={link}>
              settings
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default POApprovalRequestEmail

// Styles
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
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 16px",
}

const poBox = {
  backgroundColor: "#ffffff",
  border: "2px solid #2563eb",
  borderRadius: "8px",
  padding: "24px",
  margin: "20px 0",
}

const poNumberStyle = {
  color: "#2563eb",
  fontSize: "20px",
  fontWeight: "600",
  margin: "0 0 16px",
  textAlign: "center" as const,
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

const amountCell = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: "600",
  padding: "8px 0",
}

const buttonContainer = {
  margin: "30px 0",
  textAlign: "center" as const,
}

const approveButton = {
  backgroundColor: "#16a34a",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  lineHeight: "48px",
  textAlign: "center" as const,
  textDecoration: "none",
  width: "200px",
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
}
