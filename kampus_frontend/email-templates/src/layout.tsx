import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import React from 'react'
import type { CSSProperties, ReactNode } from 'react'

type Accent = 'blue' | 'green' | 'red' | 'orange'

type TemplateLayoutProps = {
  preview: string
  title: string
  intro?: string
  body: string
  ctaUrl?: string
  ctaLabel?: string
  badge?: string
  accent?: Accent
}

const ACCENT: Record<Accent, { title: string; button: string; badgeBg: string; badgeText: string }> = {
  blue: { title: '#0f172a', button: '#0ea5e9', badgeBg: '#dbeafe', badgeText: '#1d4ed8' },
  green: { title: '#0f172a', button: '#16a34a', badgeBg: '#dcfce7', badgeText: '#166534' },
  red: { title: '#7f1d1d', button: '#dc2626', badgeBg: '#fee2e2', badgeText: '#b91c1c' },
  orange: { title: '#7c2d12', button: '#ea580c', badgeBg: '#ffedd5', badgeText: '#9a3412' },
}

const styles: Record<string, CSSProperties> = {
  body: {
    margin: 0,
    padding: 24,
    backgroundColor: '#f1f5f9',
    fontFamily: 'Arial,Helvetica,sans-serif',
  },
  card: {
    border: '1px solid #e2e8f0',
    borderRadius: 14,
    backgroundColor: '#ffffff',
    padding: 24,
  },
  heading: {
    margin: '12px 0 12px',
    fontSize: 22,
    lineHeight: 1.25,
  },
  intro: {
    margin: '0 0 16px',
    fontSize: 14,
    lineHeight: 1.6,
    color: '#334155',
  },
  bodyText: {
    margin: '0 0 20px',
    fontSize: 14,
    lineHeight: 1.7,
    color: '#334155',
    whiteSpace: 'pre-line',
  },
  buttonWrap: {
    margin: 0,
  },
  button: {
    borderRadius: 8,
    padding: '12px 18px',
    color: '#ffffff',
    textDecoration: 'none',
    fontWeight: 600,
  },
  badge: {
    display: 'inline-block',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
}

function shell(content: ReactNode, preview: string) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>{content}</Container>
      </Body>
    </Html>
  )
}

export function TemplateLayout({
  preview,
  title,
  intro,
  body,
  ctaUrl,
  ctaLabel,
  badge,
  accent = 'blue',
}: TemplateLayoutProps) {
  const palette = ACCENT[accent]

  return shell(
    <>
      {badge ? (
        <Text
          style={{
            ...styles.badge,
            backgroundColor: palette.badgeBg,
            color: palette.badgeText,
          }}
        >
          {badge}
        </Text>
      ) : null}

      <Heading style={{ ...styles.heading, color: palette.title }}>{title}</Heading>
      {intro ? <Text style={styles.intro}>{intro}</Text> : null}
      <Text style={styles.bodyText}>{body}</Text>
      {ctaUrl ? (
        <Section style={styles.buttonWrap}>
          <Button href={ctaUrl} style={{ ...styles.button, backgroundColor: palette.button }}>
            {ctaLabel || 'Ver detalle'}
          </Button>
        </Section>
      ) : null}
    </>,
    preview
  )
}
