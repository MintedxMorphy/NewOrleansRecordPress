"use client";

import { SessionProvider } from "next-auth/react";

const navLinks = [
  { href: "/staff", label: "Operations Guide" },
  { href: "/staff/dashboard", label: "Production Board", active: true },
  { href: "/staff/pricing", label: "Pricing & Market" },
  { href: "/staff/suppliers", label: "PVC Suppliers" },
  { href: "/staff/plants", label: "Plant Directory" },
  { href: "/staff/mastering", label: "Mastering & Plating" },
  { href: "/staff/inventory", label: "Inventory" },
  { href: "/staff/qc", label: "Shift Logs" },
];

export default function StaffDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div style={{ background: "#090909", minHeight: "100vh" }}>
        <nav style={{
          alignItems: "center",
          background: "#0a0c0f",
          borderBottom: "1px solid #2a2c33",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
          display: "flex",
          flexWrap: "wrap",
          gap: "14px",
          justifyContent: "center",
          padding: "16px 28px",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}>
          <img src="/staff/norp-logo.png" alt="NORP" style={{ height: "70px", marginRight: "8px" }} />
          {navLinks.map(link => (
            <a
              key={link.href}
              href={link.href}
              style={{
                background: link.active ? "#0a1a15" : "#14161b",
                border: `1px solid ${link.active ? "#1f7d5b" : "#2a2c33"}`,
                borderRadius: "10px",
                boxShadow: link.active ? "0 0 0 1px rgba(93,202,165,.18), 0 8px 18px rgba(0,0,0,.18)" : "inset 0 1px 0 rgba(255,255,255,.03)",
                color: link.active ? "#5DCAA5" : "#d2d0c3",
                fontFamily: "sans-serif",
                fontSize: "24px",
                fontWeight: 800,
                lineHeight: 1,
                padding: "13px 18px",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {link.label}
            </a>
          ))}
        </nav>
        {children}
      </div>
    </SessionProvider>
  );
}
