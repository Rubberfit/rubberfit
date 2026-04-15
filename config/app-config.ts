import packageJson from "../package.json"

const currentYear = new Date().getFullYear()

export const APP_CONFIG = {
  name: "RubberFit",
  version: packageJson.version,
  copyright: `© ${currentYear}, Arc & Anchor.`,
  meta: {
    title: "RubberFit - CRM & 2D Nesting Engine for Rubber Manufacturing",
    description:
      "RubberFit is a CRM and 2D nesting engine for rubber manufacturing. Manage suppliers, procurement, inventory, and optimize material cuts to minimize waste.",
  },
}
