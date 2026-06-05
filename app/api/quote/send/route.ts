import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

const AIRTABLE_API_URL = "https://api.airtable.com/v0"
const QUOTE_TABLE_FALLBACK = "Quote Requests"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "neworleansrecordpress@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

type AirtableFieldMeta = {
  id: string
  name: string
  type: string
}

type AirtableTableMeta = {
  id: string
  name: string
  fields: AirtableFieldMeta[]
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n)
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function row(label: string, value: unknown) {
  return `<tr><td style="padding:4px 8px;color:#666">${escapeHtml(label)}</td><td style="padding:4px 8px;text-align:right;font-family:monospace">${escapeHtml(value || "—")}</td></tr>`
}

function lineItem(label: string, amount: number) {
  return row(label, fmt(amount))
}

function airtableToken() {
  return process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_PAT
}

function airtableBaseId() {
  return process.env.AIRTABLE_BASE_ID
}

function airtableQuoteTable() {
  return process.env.AIRTABLE_QUOTES_TABLE || process.env.AIRTABLE_QUOTE_TABLE || QUOTE_TABLE_FALLBACK
}

function airtableQuoteTableCandidates() {
  return Array.from(new Set([
    airtableQuoteTable(),
    "Quote Request",
    QUOTE_TABLE_FALLBACK,
    "Quotes",
    "On Hold",
  ].filter(Boolean)))
}

function airtableHeaders() {
  const token = airtableToken()
  if (!token) throw new Error("Missing Airtable token")
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

function tableUrl(table: string) {
  const baseId = airtableBaseId()
  if (!baseId) throw new Error("Missing Airtable base id")
  return `${AIRTABLE_API_URL}/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`
}

function baseMetaUrl() {
  const baseId = airtableBaseId()
  if (!baseId) throw new Error("Missing Airtable base id")
  return `${AIRTABLE_API_URL}/meta/bases/${encodeURIComponent(baseId)}/tables`
}

async function getAirtableTablesMeta() {
  const res = await fetch(baseMetaUrl(), {
    headers: airtableHeaders(),
    cache: "no-store",
  })
  const data = await res.json() as { tables?: AirtableTableMeta[]; error?: { message?: string } }
  if (!res.ok) throw new Error(data.error?.message || `Airtable metadata lookup failed (${res.status})`)
  return data.tables || []
}

function resolveAirtableTable(tables: AirtableTableMeta[], configuredTable: string) {
  return tables.find(table => table.id === configuredTable || table.name.toLowerCase() === configuredTable.toLowerCase())
}

function resolveAirtableField(table: AirtableTableMeta, names: string[]) {
  return table.fields.find(field =>
    names.some(name => field.name.toLowerCase() === name.toLowerCase())
  )
}

function isWritableField(field: AirtableFieldMeta) {
  return ![
    "aiText",
    "autoNumber",
    "button",
    "count",
    "createdBy",
    "createdTime",
    "externalSyncSource",
    "formula",
    "lastModifiedBy",
    "lastModifiedTime",
    "lookup",
    "multipleLookupValues",
    "rollup",
  ].includes(field.type)
}

function airtableValueForField(field: AirtableFieldMeta, value: unknown) {
  if (value === undefined || value === null || value === "") return undefined

  if (["number", "currency", "percent", "rating", "duration"].includes(field.type)) {
    const numeric = Number(String(value).replace(/,/g, ""))
    return Number.isFinite(numeric) ? numeric : undefined
  }

  if (field.type === "checkbox") {
    if (typeof value === "boolean") return value
    return ["yes", "true", "1", "on"].includes(String(value).trim().toLowerCase())
  }

  if (["date", "dateTime"].includes(field.type)) {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }

  if (field.type === "multipleSelects") {
    return Array.isArray(value) ? value.map(String) : String(value).split(",").map(item => item.trim()).filter(Boolean)
  }

  return String(value)
}

function assignAirtableField(
  table: AirtableTableMeta,
  fields: Record<string, unknown>,
  names: string[],
  value: unknown
) {
  const field = resolveAirtableField(table, names)
  if (!field || !isWritableField(field)) return

  const airtableValue = airtableValueForField(field, value)
  if (airtableValue !== undefined) fields[field.name] = airtableValue
}

function quoteSummary(body: Record<string, any>, submissionType: string) {
  const estimate = body.estimate || {}
  return [
    `${submissionType} submitted from nolavinyl.com`,
    `Name: ${body.name || ""}`,
    `Email: ${body.email || ""}`,
    `Phone: ${body.phone || ""}`,
    `Project Type: ${body.projectTypeLabel || body.projectType || ""}`,
    `Quantity: ${body.quantity || ""}`,
    `Vinyl Color: ${body.vinylColorLabel || body.vinylColor || ""}`,
    `Master Format: ${body.masterFormatLabel || body.masterFormat || ""}`,
    `Test Pressings: ${body.testPressings ?? ""}`,
    `Center Labels: ${body.centerLabelsLabel || body.centerLabels || ""}`,
    `Inner Sleeves: ${body.innerSleevesLabel || body.innerSleeves || ""}`,
    `Inserts: ${body.insertsLabel || body.inserts || ""}`,
    `Jackets: ${body.jacketsLabel || body.jackets || ""}`,
    `Jacket Upgrades: ${body.jacketUpgradesLabel || "None"}`,
    `Outer Sleeves: ${body.outerSleevesLabel || body.outerSleeves || ""}`,
    `Shrinkwrap: ${body.shrinkwrap ? "Yes" : "No"}`,
    `UPC Barcodes: ${body.upcBarcodesLabel || body.upcBarcodes || ""}`,
    `Assembly: ${body.assemblyLabel || body.assembly || ""}`,
    `Extras: ${body.extrasLabel || "None"}`,
    `Total Estimate: ${estimate.grandTotal ? fmt(Number(estimate.grandTotal)) : ""}`,
    `Unit Price: ${estimate.unitPrice ? fmt(Number(estimate.unitPrice)) : ""}`,
  ].join("\n")
}

async function saveQuoteToAirtable(body: Record<string, any>, submissionType: string) {
  if (!airtableToken() || !airtableBaseId()) {
    throw new Error("Airtable is not configured for quote submissions")
  }

  const tables = await getAirtableTablesMeta()
  const table = airtableQuoteTableCandidates()
    .map(candidate => resolveAirtableTable(tables, candidate))
    .find((candidate): candidate is AirtableTableMeta => Boolean(candidate))
  if (!table) {
    throw new Error(`Airtable table not found: ${airtableQuoteTableCandidates().join(", ")}`)
  }

  const estimate = body.estimate || {}
  const summary = quoteSummary(body, submissionType)
  const leadTitle = `${submissionType}: ${body.name || "Unknown"}`
  const fields: Record<string, unknown> = {}

  assignAirtableField(table, fields, ["Name"], leadTitle)
  assignAirtableField(table, fields, ["Customer", "Customer Name"], body.name)
  assignAirtableField(table, fields, ["Email", "Customer Email"], body.email)
  assignAirtableField(table, fields, ["Phone", "Customer Phone"], body.phone)
  assignAirtableField(table, fields, ["Submission Type", "Type", "Action"], submissionType)
  assignAirtableField(table, fields, ["Project Type", "Format"], body.projectTypeLabel || body.projectType)
  assignAirtableField(table, fields, ["Quantity", "Qty"], body.quantity)
  assignAirtableField(table, fields, ["Vinyl Color", "Color"], body.vinylColorLabel || body.vinylColor)
  assignAirtableField(table, fields, ["Master Format", "Mastering"], body.masterFormatLabel || body.masterFormat)
  assignAirtableField(table, fields, ["Test Pressings", "TPs"], body.testPressings)
  assignAirtableField(table, fields, ["Center Labels", "Labels"], body.centerLabelsLabel || body.centerLabels)
  assignAirtableField(table, fields, ["Inner Sleeves", "Sleeves"], body.innerSleevesLabel || body.innerSleeves)
  assignAirtableField(table, fields, ["Inserts"], body.insertsLabel || body.inserts)
  assignAirtableField(table, fields, ["Jackets"], body.jacketsLabel || body.jackets)
  assignAirtableField(table, fields, ["Jacket Upgrades"], body.jacketUpgradesLabel || "None")
  assignAirtableField(table, fields, ["Outer Sleeves"], body.outerSleevesLabel || body.outerSleeves)
  assignAirtableField(table, fields, ["Shrinkwrap"], body.shrinkwrap)
  assignAirtableField(table, fields, ["UPC Barcodes", "UPC"], body.upcBarcodesLabel || body.upcBarcodes)
  assignAirtableField(table, fields, ["Assembly"], body.assemblyLabel || body.assembly)
  assignAirtableField(table, fields, ["Extras"], body.extrasLabel || "None")
  assignAirtableField(table, fields, ["Total Estimate", "Estimated Total", "Grand Total"], estimate.grandTotal)
  assignAirtableField(table, fields, ["Unit Price"], estimate.unitPrice)
  assignAirtableField(table, fields, ["Quote Summary", "Summary", "Notes"], summary)
  assignAirtableField(table, fields, ["Payload", "Raw Payload"], JSON.stringify(body, null, 2))
  assignAirtableField(table, fields, ["Submitted At", "Created At", "Date"], new Date().toISOString())

  // Keep On Hold as the emergency fallback if the quote table is renamed or
  // temporarily unavailable, but prefer the dedicated Quote Requests table.
  if (table.name.toLowerCase() === "on hold") {
    assignAirtableField(table, fields, ["Name"], `${leadTitle}\n\n${summary}`)
  }

  const res = await fetch(tableUrl(table.name), {
    method: "POST",
    headers: airtableHeaders(),
    body: JSON.stringify({ fields, typecast: true }),
  })
  const data = await res.json() as { id?: string; error?: { message?: string } }
  if (!res.ok) throw new Error(data.error?.message || `Airtable quote save failed (${res.status})`)
  return data.id
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
      upcBarcodes,
      shrinkwrap,
      jacketUpgradesLabel,
      extrasLabel,
      projectTypeLabel,
      vinylColorLabel,
      masterFormatLabel,
      centerLabelsLabel,
      innerSleevesLabel,
      insertsLabel,
      jacketsLabel,
      outerSleevesLabel,
      upcBarcodesLabel,
      assemblyLabel,
      action,
      // Calculated estimate
      estimate,
    } = body

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    const upgradeList = jacketUpgrades ? Object.entries(jacketUpgrades).filter(([, v]) => v).map(([k]) => k).join(", ") || "None" : "None"
    const submissionType = action === "start_order" ? "Start Order" : "Save Quote"
    const airtableRecordId = await saveQuoteToAirtable(body, submissionType)
    const internalSubject = action === "start_order" ? `New Order by ${name}` : `Quote Saved by ${name}`
    const customerSubject = action === "start_order"
      ? "Your New Orleans Record Press order request"
      : "Your New Orleans Record Press quote"

    const htmlBody = `
      <h2 style="font-family:sans-serif">${escapeHtml(submissionType)} — New Orleans Record Press</h2>

      <h3 style="font-family:sans-serif;margin-top:24px">Contact</h3>
      <table cellpadding="0" cellspacing="0" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        ${row("Name", name)}
        ${row("Email", email)}
        ${row("Phone", phone || "Not provided")}
      </table>

      <h3 style="font-family:sans-serif;margin-top:24px">Project Specs</h3>
      <table cellpadding="0" cellspacing="0" style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
        ${row("Format", projectTypeLabel || projectType || "—")}
        ${row("Quantity", String(quantity || "—"))}
        ${row("Vinyl Color", vinylColorLabel || vinylColor || "—")}
        ${row("Master Format", masterFormatLabel || masterFormat || "—")}
        ${row("Test Pressings", String(testPressings ?? "—"))}
        ${row("Center Labels", centerLabelsLabel || centerLabels || "—")}
        ${row("Inner Sleeves", innerSleevesLabel || innerSleeves || "—")}
        ${row("Inserts", insertsLabel || inserts || "—")}
        ${row("Jackets", jacketsLabel || jackets || "—")}
        ${row("Jacket Upgrades", jacketUpgradesLabel || upgradeList)}
        ${row("Outer Sleeves", outerSleevesLabel || outerSleeves || "—")}
        ${row("Shrinkwrap", shrinkwrap ? "Yes" : "No")}
        ${row("UPC Barcodes", upcBarcodesLabel || upcBarcodes || "—")}
        ${row("Assembly", assemblyLabel || assembly || "—")}
        ${row("Extras", extrasLabel || "None")}
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

    await Promise.all([
      transporter.sendMail({
        from: "neworleansrecordpress@gmail.com",
        to: "info@neworleansrecordpress.com",
        replyTo: email,
        subject: internalSubject,
        html: htmlBody,
      }),
      transporter.sendMail({
        from: "neworleansrecordpress@gmail.com",
        to: email,
        replyTo: "info@neworleansrecordpress.com",
        subject: customerSubject,
        html: htmlBody,
      }),
    ])

    return NextResponse.json({ ok: true, airtableRecordId })
  } catch (err) {
    console.error("Quote send API error:", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send quote request" }, { status: 500 })
  }
}
