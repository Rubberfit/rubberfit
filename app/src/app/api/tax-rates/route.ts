import { NextRequest, NextResponse } from "next/server"

interface ZiptaxResult {
  geoPostalCode: string
  geoCity: string
  geoCounty: string
  geoState: string
  taxSales: number
  taxUse: number
  stateSalesTax: number
  citySalesTax: number
  countySalesTax: number
  distSalesTax: number
}

interface ZiptaxResponse {
  version: string
  rCode: number
  results: ZiptaxResult[]
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const postalCode = searchParams.get("postalCode")

  if (!postalCode || !/^\d{5}(-\d{4})?$/.test(postalCode)) {
    return NextResponse.json(
      { error: "Valid US postal code required (5 digits or ZIP+4)" },
      { status: 400 }
    )
  }

  const apiKey = process.env.ZIPTAX_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: "Ziptax API key not configured" }, { status: 503 })
  }

  try {
    const zip5 = postalCode.substring(0, 5)
    const url = `https://api.zip-tax.com/request/v40?key=${apiKey}&postalcode=${zip5}`

    const response = await fetch(url, {
      next: { revalidate: 86400 },
    })

    if (!response.ok) {
      console.error("Ziptax API error:", response.status)
      return NextResponse.json(
        { error: "Tax rate lookup failed", status: response.status },
        { status: 502 }
      )
    }

    const data: ZiptaxResponse = await response.json()

    // rCode 100 = success, 101 = no results, others = error
    if (data.rCode !== 100 || !data.results || data.results.length === 0) {
      return NextResponse.json(
        { error: "No tax rate found for this ZIP code", rCode: data.rCode },
        { status: 404 }
      )
    }

    const result = data.results[0]

    // Build rates breakdown
    const rates = []
    if (result.stateSalesTax > 0) {
      rates.push({ rate: result.stateSalesTax, name: `${result.geoState} State`, type: "State" })
    }
    if (result.countySalesTax > 0) {
      rates.push({
        rate: result.countySalesTax,
        name: `${result.geoCounty} County`,
        type: "County",
      })
    }
    if (result.citySalesTax > 0) {
      rates.push({ rate: result.citySalesTax, name: `${result.geoCity} City`, type: "City" })
    }
    if (result.distSalesTax > 0) {
      rates.push({ rate: result.distSalesTax, name: "District", type: "District" })
    }

    return NextResponse.json({
      totalRate: result.taxSales,
      rates,
      postalCode: zip5,
      city: result.geoCity,
      state: result.geoState,
      county: result.geoCounty,
    })
  } catch (error) {
    console.error("Ziptax API request failed:", error)
    return NextResponse.json({ error: "Tax rate lookup failed" }, { status: 502 })
  }
}
