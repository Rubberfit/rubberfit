import * as React from 'react';
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface LowStockEmailProps {
  materialName: string;
  currentStock: number;
  minStock: number;
  percentageRemaining: number;
}

export const LowStockEmail = ({
  materialName,
  currentStock,
  minStock,
  percentageRemaining,
}: LowStockEmailProps) => (
  <Html>
    <Head />
    <Preview>Low stock alert for {materialName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>RubberFit Pro</Heading>
          <Text style={subtitle}>Inventory Management System</Text>
        </Section>

        <Section style={alertBox}>
          <Text style={alertTitle}>⚠️ Low Stock Alert</Text>
        </Section>

        <Section style={content}>
          <Heading as="h2" style={h2}>
            {materialName}
          </Heading>

          <div style={statsContainer}>
            <div style={statBox}>
              <Text style={statLabel}>Current Stock</Text>
              <Text style={statValue}>{currentStock.toFixed(2)} sqft</Text>
            </div>
            <div style={statBox}>
              <Text style={statLabel}>Minimum Required</Text>
              <Text style={statValue}>{minStock.toFixed(2)} sqft</Text>
            </div>
            <div style={statBox}>
              <Text style={statLabel}>Remaining</Text>
              <Text style={percentageRemaining > 25 ? statValue : statValueCritical}>
                {percentageRemaining}%
              </Text>
            </div>
          </div>

          <Text style={message}>
            The stock level for {materialName} has fallen below the minimum threshold.
            Please consider reordering to maintain adequate inventory levels.
          </Text>

          <Link href={`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/inventory`} style={button}>
            View Inventory
          </Link>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>
            This is an automated notification from RubberFit Pro.
            <br />
            To manage your notification preferences, visit your account settings.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

const main = {
  backgroundColor: '#f8f9fa',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
};

const header = {
  padding: '32px 32px 24px',
  borderBottom: '1px solid #e5e7eb',
};

const h1 = {
  color: '#111827',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '36px',
  margin: '0',
};

const subtitle = {
  color: '#6b7280',
  fontSize: '14px',
  margin: '4px 0 0',
};

const alertBox = {
  backgroundColor: '#fef3c7',
  borderLeft: '4px solid #d97706',
  padding: '12px 32px',
  margin: '0',
};

const alertTitle = {
  color: '#92400e',
  fontSize: '16px',
  fontWeight: '600',
  margin: '0',
};

const content = {
  padding: '32px',
};

const h2 = {
  color: '#111827',
  fontSize: '20px',
  fontWeight: '600',
  lineHeight: '28px',
  margin: '0 0 24px',
};

const statsContainer = {
  display: 'flex',
  gap: '16px',
  marginBottom: '24px',
};

const statBox = {
  flex: '1',
  padding: '16px',
  backgroundColor: '#f3f4f6',
  borderRadius: '8px',
  textAlign: 'center' as const,
};

const statLabel = {
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: '500',
  margin: '0 0 4px',
  textTransform: 'uppercase' as const,
};

const statValue = {
  color: '#111827',
  fontSize: '20px',
  fontWeight: '600',
  margin: '0',
};

const statValueCritical = {
  ...statValue,
  color: '#dc2626',
};

const message = {
  color: '#4b5563',
  fontSize: '14px',
  lineHeight: '21px',
  margin: '0 0 24px',
};

const button = {
  backgroundColor: '#2563eb',
  borderRadius: '6px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '14px',
  fontWeight: '600',
  lineHeight: '16px',
  padding: '12px 24px',
  textDecoration: 'none',
  textAlign: 'center' as const,
};

const footer = {
  padding: '24px 32px',
  borderTop: '1px solid #e5e7eb',
};

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '18px',
  margin: '0',
};