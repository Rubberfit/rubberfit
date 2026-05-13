import type { ReactNode } from "react"

import "../(auth)/auth-layout.css"

export default function CheckoutLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>
}
