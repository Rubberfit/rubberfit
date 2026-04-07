import packageJson from "../../package.json"

const currentYear = new Date().getFullYear()

export const APP_CONFIG = {
  name: "RubberFit Pro",
  version: packageJson.version,
  copyright: `© ${currentYear}, USI Manufacturing.`,
  meta: {
    title: "RubberFit Pro - Material Optimization & Inventory Management",
    description:
      "RubberFit Pro is a material optimization and inventory management system for rubber manufacturing. Track inventory, optimize material cuts to minimize waste, and manage your rubber roll stock efficiently.",
  },
}
