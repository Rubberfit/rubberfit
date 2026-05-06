import "reflect-metadata"
import "@/di/di-registration"
import type { ReactNode } from "react"

import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { SpeedInsights } from "@vercel/speed-insights/next"

import { Toaster } from "@/app/components/ui/sonner"
import { APP_CONFIG } from "@/config/app-config"
import { AuthProvider } from "@/app/contexts/AuthContext"
import { PREFERENCE_DEFAULTS } from "@/app/lib/preferences/preferences-config"
import { ThemeBootScript } from "@/app/scripts/theme-boot"
import { PreferencesStoreProvider } from "@/app/stores/preferences/preferences-provider"

import "./globals.css"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { theme_mode, content_layout, navbar_style, sidebar_variant, sidebar_collapsible } =
    PREFERENCE_DEFAULTS
  return (
    <html
      lang="en"
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
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
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
        <SpeedInsights />
      </body>
    </html>
  )
}
