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
        <style>{`
          .staff-dashboard-nav {
            align-items: center;
            background: #0a0c0f;
            border-bottom: 1px solid #2a2c33;
            box-shadow: 0 10px 30px rgba(0,0,0,.25);
            display: flex;
            flex-wrap: wrap;
            gap: 14px;
            justify-content: center;
            padding: 16px 28px;
            position: sticky;
            top: 0;
            z-index: 100;
          }
          .staff-dashboard-logo { height: 70px; margin-right: 8px; }
          .staff-dashboard-link {
            border-radius: 10px;
            font-family: sans-serif;
            font-size: 24px;
            font-weight: 800;
            line-height: 1;
            padding: 13px 18px;
            text-decoration: none;
            white-space: nowrap;
          }
          @media (max-width: 760px) {
            .staff-dashboard-nav {
              gap: 8px;
              justify-content: flex-start;
              overflow-x: auto;
              padding: 10px 12px;
              flex-wrap: nowrap;
              -webkit-overflow-scrolling: touch;
            }
            .staff-dashboard-nav::-webkit-scrollbar { display: none; }
            .staff-dashboard-logo { height: 42px; margin-right: 2px; flex: 0 0 auto; }
            .staff-dashboard-link {
              font-size: 15px;
              padding: 10px 12px;
              flex: 0 0 auto;
            }
          }
        `}</style>
        <nav className="staff-dashboard-nav">
          <img className="staff-dashboard-logo" src="/staff/norp-logo.png" alt="NORP" />
          {navLinks.map(link => (
            <a
              key={link.href}
              className="staff-dashboard-link"
              href={link.href}
              style={{
                background: link.active ? "#0a1a15" : "#14161b",
                border: `1px solid ${link.active ? "#1f7d5b" : "#2a2c33"}`,
                boxShadow: link.active ? "0 0 0 1px rgba(93,202,165,.18), 0 8px 18px rgba(0,0,0,.18)" : "inset 0 1px 0 rgba(255,255,255,.03)",
                color: link.active ? "#5DCAA5" : "#d2d0c3",
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
