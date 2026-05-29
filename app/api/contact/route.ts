import { NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "neworleansrecordpress@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, email, phone, projectType, quantity, message } = body

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 })
    }

    await transporter.sendMail({
      from: "neworleansrecordpress@gmail.com",
      to: "info@neworleansrecordpress.com",
      replyTo: email,
      subject: `New Quote Request from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || "Not provided"}\nProject Type: ${projectType || "Not specified"}\nQuantity: ${quantity || "Not specified"}\n\nMessage:\n${message || "(no message)"}`,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Contact API error:", err)
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 })
  }
}
