import "reflect-metadata"
import "@/di/di-registration"
import type { ReactNode } from "react"

import type { Metadata } from "next"
import { Inter, Manrope, JetBrains_Mono } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

import { SpeedInsights } from "@vercel/speed-insights/next"

import { Toaster } from "@/app/components/ui/sonner"
import { APP_CONFIG } from "@/config/app-config"
import { AuthProvider } from "@/app/contexts/AuthContext"
import { PREFERENCE_DEFAULTS } from "@/app/lib/preferences/preferences-config"
import { ThemeBootScript } from "@/app/scripts/theme-boot"
import { PreferencesStoreProvider } from "@/app/stores/preferences/preferences-provider"

import "./globals.css"

const INTER = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
})

const MANROPE = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
})

const JETBRAINS_MONO = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, content_layout, navbar_style, sidebar_variant, sidebar_collapsible } =
    PREFERENCE_DEFAULTS
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html
      lang={locale}
      data-theme-mode={theme_mode}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      suppressHydrationWarning
    >
      <head>
        {/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
        <ThemeBootScript />
      </head>
      <body
        className={`${INTER.variable} ${MANROPE.variable} ${JETBRAINS_MONO.variable} min-h-screen antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>
            <PreferencesStoreProvider
              themeMode={theme_mode}
              contentLayout={content_layout}
              navbarStyle={navbar_style}
            >
              {children}
              <Toaster />
            </PreferencesStoreProvider>
          </AuthProvider>
        </NextIntlClientProvider>
        <SpeedInsights />
      </body>
    </html>
  )
}
