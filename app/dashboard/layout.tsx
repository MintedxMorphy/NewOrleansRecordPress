"use client";
import { SessionProvider } from "next-auth/react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <div style={{ background: "#0A0A0A", minHeight: "100vh", color: "#E8E8E8", fontFamily: "sans-serif" }}>
        <nav style={{ background: "#141414", borderBottom: "1px solid #2A2A2A", padding: "0 24px", height: "56px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ color: "#1A53FF", fontWeight: 700, fontSize: "18px" }}>NORP</span>
            <span style={{ color: "#2A2A2A" }}>|</span>
            <span style={{ color: "#9A9A9A", fontSize: "14px" }}>Operations Dashboard</span>
            <a href="/dashboard" style={{ color: "#9A9A9A", fontSize: "13px", marginLeft: "16px", textDecoration: "none" }}>Home</a>
            <a href="/dashboard/admin" style={{ color: "#9A9A9A", fontSize: "13px", textDecoration: "none" }}>Admin</a>
          </div>
        </nav>
        <main style={{ padding: "24px" }}>{children}</main>
      </div>
    </SessionProvider>
  );
}
