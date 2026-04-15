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

interface LowStockAlertEmailProps {
  materialName: string
  currentStock: number
  reorderPoint: number
  supplier?: string
  companyName: string
}

const LowStockAlertEmail: React.FC<LowStockAlertEmailProps> = ({
  materialName,
  currentStock,
  reorderPoint,
  supplier,
  companyName,
}) => {
  const previewText = `Low stock alert for ${materialName}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>⚠️ Low Stock Alert</Heading>

          <Text style={text}>The following material has fallen below its reorder point:</Text>

          <Section style={alertBox}>
            <Text style={alertTitle}>{materialName}</Text>
            <Hr style={divider} />
            <Text style={metric}>
              <strong>Current Stock:</strong>{" "}
              <span style={currentStock < reorderPoint * 0.5 ? criticalValue : warningValue}>
                {currentStock.toLocaleString()} sq ft
              </span>
            </Text>
            <Text style={metric}>
              <strong>Reorder Point:</strong> {reorderPoint.toLocaleString()} sq ft
            </Text>
            {supplier && (
              <Text style={metric}>
                <strong>Preferred Supplier:</strong> {supplier}
              </Text>
            )}
          </Section>

          <Text style={text}>
            Please review and create a purchase order to replenish inventory.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={`${process.env.NEXT_PUBLIC_APP_URL}/inventory`}>
              View Inventory
            </Button>
          </Section>

          <Hr style={divider} />

          <Text style={footer}>
            This is an automated notification from {companyName} RubberFit.
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

export default LowStockAlertEmail

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

const alertBox = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "20px",
  margin: "20px 0",
}

const alertTitle = {
  color: "#111827",
  fontSize: "18px",
  fontWeight: "600",
  margin: "0 0 12px",
}

const metric = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "8px 0",
}

const warningValue = {
  color: "#d97706",
  fontWeight: "600",
}

const criticalValue = {
  color: "#dc2626",
  fontWeight: "600",
}

const buttonContainer = {
  margin: "30px 0",
  textAlign: "center" as const,
}

const button = {
  backgroundColor: "#2563eb",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "14px",
  fontWeight: "500",
  lineHeight: "44px",
  textAlign: "center" as const,
  textDecoration: "none",
  width: "180px",
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
