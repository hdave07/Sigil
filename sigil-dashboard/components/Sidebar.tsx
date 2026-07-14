"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/agents", label: "Dashboard" },
  { href: "/setup", label: "Mission setup" },
  { href: "/approvals", label: "Approval queue" },
  { href: "/audit", label: "Audit timeline" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-[220px] min-w-[220px] bg-ink flex flex-col px-3 py-6">
      <div className="flex items-center gap-2 px-3 pb-5 mb-2 border-b border-white/[0.06] text-rose font-bold text-xs tracking-[0.2em] uppercase">
        <span className="w-2 h-2 rounded-full bg-rose shadow-[0_0_10px_rgba(201,173,167,0.6)]" />
        Sigil
      </div>
      <div className="flex flex-col gap-0.5">
        {links.map((l) => {
          const active = pathname?.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                active ? "bg-accent text-white shadow-sm" : "text-gray-400 hover:bg-white/[0.06] hover:text-gray-200"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-auto pt-4 border-t border-white/[0.06] px-3">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="5" y="11" width="14" height="9" rx="1.5" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Secured with OAuth 2.0
        </div>
      </div>
    </nav>
  );
}
