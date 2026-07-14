"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/agents", label: "Agent list" },
  { href: "/approvals", label: "Approval queue" },
  { href: "/audit", label: "Audit timeline" },
  { href: "/setup", label: "Mission setup" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-[220px] min-w-[220px] bg-ink flex flex-col gap-0.5 px-3 py-6">
      <div className="flex items-center gap-2 px-3 pb-6 text-accent font-bold text-xs tracking-widest uppercase">
        <span className="w-2 h-2 rounded-full bg-accent" />
        Sigil
      </div>
      {links.map((l) => {
        const active = pathname?.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-2.5 text-[13px] transition-colors ${
              active ? "bg-accent text-white" : "text-gray-400 hover:bg-[#1e2230] hover:text-gray-200"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
