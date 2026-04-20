import "reflect-metadata"
import "@/di/di-registration"
import type { ReactNode } from "react"

import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"

import { Toaster } from "@/app/components/ui/sonner"
import { APP_CONFIG } from "@/config/app-config"
import { AuthProvider } from "@/app/contexts/AuthContext"
import { fontVars } from "@/app/lib/fonts/registry"
import { PREFERENCE_DEFAULTS } from "@/app/lib/preferences/preferences-config"
import { ThemeBootScript } from "@/app/scripts/theme-boot"
import { PreferencesStoreProvider } from "@/app/stores/preferences/preferences-provider"

import "./globals.css"

export const metadata: Metadata = {
  title: APP_CONFIG.meta.title,
  description: APP_CONFIG.meta.description,
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const {
    theme_mode,
    theme_preset,
    content_layout,
    navbar_style,
    sidebar_variant,
    sidebar_collapsible,
    font,
  } = PREFERENCE_DEFAULTS
  return (
    <html
      lang="en"
      data-theme-mode={theme_mode}
      data-theme-preset={theme_preset}
      data-content-layout={content_layout}
      data-navbar-style={navbar_style}
      data-sidebar-variant={sidebar_variant}
      data-sidebar-collapsible={sidebar_collapsible}
      data-font={font}
      suppressHydrationWarning
    >
      <head>
        {/* Applies theme and layout preferences on load to avoid flicker and unnecessary server rerenders. */}
        <ThemeBootScript />
      </head>
      <body className={`${fontVars} min-h-screen antialiased`}>
        <AuthProvider>
          <PreferencesStoreProvider
            themeMode={theme_mode}
            themePreset={theme_preset}
            contentLayout={content_layout}
            navbarStyle={navbar_style}
            font={font}
          >
            {children}
            <Toaster />
          </PreferencesStoreProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
