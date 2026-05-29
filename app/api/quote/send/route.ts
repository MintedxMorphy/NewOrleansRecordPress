import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "neworleansrecordpress@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function lineItem(label: string, amount: number) {
  return `<tr><td style="padding:4px 8px;color:#666">${label}</td><td style="padding:4px 8px;text-align:right;font-family:monospace">${fmt(amount)}</td></tr>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      // Contact info
      name,
      email,
      phone,
      // Quote details
      projectType,
      quantity,
      vinylColor,
      testPressings,
      masterFormat,
      centerLabels,
      innerSleeves,
      inserts,
      jackets,
      jacketUpgrades,
      outerSleeves,
      assembly,
      // Calculated estimate
      estimate,
    } = body

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    const upgradeList = jacketUpgrades ? Object.entries(jacketUpgrades).filter(([, v]) => v).map(([k]) => k).join(", ") || "None" : "None"

    const htmlBody = `
      <h2 style="font-family:sans-serif">New Quote Request — New Orleans Record Press</h2>

      <h3 style="font-family:sans-serif;margin-top:24px">Contact</h3>
      <table cellpadding="0" cellspacing="0" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        ${lineItem("Name", 0).replace(fmt(0), name)}
        ${lineItem("Email", 0).replace(fmt(0), email)}
        ${lineItem("Phone", 0).replace(fmt(0), phone || "Not provided")}
      </table>

      <h3 style="font-family:sans-serif;margin-top:24px">Project Specs</h3>
      <table cellpadding="0" cellspacing="0" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        ${lineItem("Format", 0).replace(fmt(0), projectType || "—")}
        ${lineItem("Quantity", 0).replace(fmt(0), String(quantity || "—"))}
        ${lineItem("Vinyl Color", 0).replace(fmt(0), vinylColor || "—")}
        ${lineItem("Master Format", 0).replace(fmt(0), masterFormat || "—")}
        ${lineItem("Test Pressings", 0).replace(fmt(0), String(testPressings ?? "—"))}
        ${lineItem("Center Labels", 0).replace(fmt(0), centerLabels || "—")}
        ${lineItem("Inner Sleeves", 0).replace(fmt(0), innerSleeves || "—")}
        ${lineItem("Inserts", 0).replace(fmt(0), inserts || "—")}
        ${lineItem("Jackets", 0).replace(fmt(0), jackets || "—")}
        ${lineItem("Jacket Upgrades", 0).replace(fmt(0), upgradeList)}
        ${lineItem("Outer Sleeves", 0).replace(fmt(0), outerSleeves || "—")}
        ${lineItem("Assembly", 0).replace(fmt(0), assembly || "—")}
      </table>

      ${estimate ? `
      <h3 style="font-family:sans-serif;margin-top:24px">Estimated Costs</h3>
      <table cellpadding="0" cellspacing="0" style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:400px">
        ${estimate.lacquerCost > 0 ? lineItem("Lacquer Cutting", estimate.lacquerCost) : ""}
        ${lineItem("Electroplating", estimate.electroplatingCost)}
        ${lineItem("Setup Fee", estimate.setupCost)}
        ${lineItem("Test Pressings", estimate.testPressingCost)}
        ${lineItem("Pressing", estimate.pressingCost)}
        ${estimate.labelCost > 0 ? lineItem("Center Labels", estimate.labelCost) : ""}
        ${estimate.innerCost > 0 ? lineItem("Inner Sleeves", estimate.innerCost) : ""}
        ${estimate.insertCost > 0 ? lineItem("Inserts", estimate.insertCost) : ""}
        ${estimate.jacketCost > 0 ? lineItem("Jackets", estimate.jacketCost) : ""}
        ${estimate.jacketUpgradeCost > 0 ? lineItem("Jacket Upgrades", estimate.jacketUpgradeCost) : ""}
        ${estimate.outerCost > 0 ? lineItem("Outer Sleeves / Shrinkwrap", estimate.outerCost) : ""}
        ${estimate.assemblyCost > 0 ? lineItem("Assembly", estimate.assemblyCost) : ""}
        <tr style="border-top:2px solid #000">
          <td style="padding:8px;font-weight:bold">TOTAL ESTIMATE</td>
          <td style="padding:8px;text-align:right;font-family:monospace;font-weight:bold;font-size:18px;color:#1A53FF">${fmt(estimate.grandTotal)}</td>
        </tr>
        <tr>
          <td style="padding:4px 8px;color:#666">Unit Price</td>
          <td style="padding:4px 8px;text-align:right;font-family:monospace">${fmt(estimate.unitPrice)}</td>
        </tr>
      </table>
      ` : ""}

      <p style="font-family:sans-serif;font-size:12px;color:#999;margin-top:24px">
        This is an estimate. Final pricing confirmed upon project review.
      </p>
    `

    await transporter.sendMail({
      from: "neworleansrecordpress@gmail.com",
      to: "info@neworleansrecordpress.com",
      replyTo: email,
      subject: `A Quote was created by ${name} — ${quantity} units`,
      html: htmlBody,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Quote send API error:", err)
    return NextResponse.json({ error: "Failed to send quote request" }, { status: 500 })
  }
}
