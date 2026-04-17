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

interface PriceChangeAlertEmailProps {
  materialName: string
  supplier: string
  oldPrice: number
  newPrice: number
  changePercentage: number
  effectiveDate: Date
  companyName: string
}

const PriceChangeAlertEmail: React.FC<PriceChangeAlertEmailProps> = ({
  materialName,
  supplier,
  oldPrice,
  newPrice,
  changePercentage,
  effectiveDate,
  companyName,
}) => {
  const previewText = `Price change alert: ${materialName} from ${supplier}`
  const isIncrease = changePercentage > 0

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{isIncrease ? "📈" : "📉"} Price Change Notification</Heading>

          <Text style={text}>A supplier has updated their pricing for the following material:</Text>

          <Section style={alertBox}>
            <Text style={alertTitle}>{materialName}</Text>
            <Text style={supplierText}>{supplier}</Text>
            <Hr style={divider} />

            <div style={priceRow}>
              <div style={priceColumn}>
                <Text style={priceLabel}>Previous Price</Text>
                <Text style={priceValue}>${oldPrice.toFixed(4)}/sq ft</Text>
              </div>
              <div style={arrow}>→</div>
              <div style={priceColumn}>
                <Text style={priceLabel}>New Price</Text>
                <Text style={priceValue}>${newPrice.toFixed(4)}/sq ft</Text>
              </div>
            </div>

            <Section style={changeSection}>
              <Text style={changeText}>
                <span style={isIncrease ? increaseStyle : decreaseStyle}>
                  {isIncrease ? "↑" : "↓"} {Math.abs(changePercentage).toFixed(1)}%
                </span>{" "}
                {isIncrease ? "increase" : "decrease"}
              </Text>
            </Section>

            <Text style={metric}>
              <strong>Effective Date:</strong> {effectiveDate.toLocaleDateString()}
            </Text>
          </Section>

          <Text style={text}>
            This price change may affect your material costs and future purchase orders.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={`${process.env.NEXT_PUBLIC_APP_URL}/suppliers`}>
              View Supplier Details
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

export default PriceChangeAlertEmail

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
  margin: "0 0 4px",
}

const supplierText = {
  color: "#6b7280",
  fontSize: "14px",
  margin: "0 0 12px",
}

const priceRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  margin: "20px 0",
}

const priceColumn = {
  flex: "1",
  textAlign: "center" as const,
}

const priceLabel = {
  color: "#6b7280",
  fontSize: "12px",
  margin: "0 0 4px",
}

const priceValue = {
  color: "#111827",
  fontSize: "20px",
  fontWeight: "600",
  margin: "0",
}

const arrow = {
  color: "#9ca3af",
  fontSize: "24px",
  padding: "0 20px",
}

const changeSection = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "12px",
  margin: "16px 0",
  textAlign: "center" as const,
}

const changeText = {
  fontSize: "16px",
  margin: "0",
}

const increaseStyle = {
  color: "#dc2626",
  fontWeight: "600",
}

const decreaseStyle = {
  color: "#16a34a",
  fontWeight: "600",
}

const metric = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "8px 0",
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
  width: "200px",
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
