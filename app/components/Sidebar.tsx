"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V21h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PipelineIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="4" width="7" height="7" rx="1.5" />
      <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16V4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12H9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const LINKS = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/pipeline", label: "Pipeline", icon: PipelineIcon },
  { href: "/upload", label: "Upload CVs", icon: UploadIcon },
];

export default function Sidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <aside className="w-20 shrink-0 bg-white border-r border-gray-100 flex flex-col items-center py-6 gap-6">
      <div className="h-10 w-10 rounded-xl bg-primary-soft flex items-center justify-center text-primary font-bold">
        K
      </div>

      <nav className="flex flex-col gap-3 mt-4">
        {LINKS.map((link) => {
          const Icon = link.icon;
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              className={clsx(
                "h-11 w-11 rounded-xl flex items-center justify-center transition-colors",
                active ? "bg-primary text-white shadow-card" : "text-gray-400 hover:bg-gray-50 hover:text-gray-600"
              )}
            >
              <Icon />
            </Link>
          );
        })}
      </nav>

      <form action="/api/logout" method="post" className="mt-auto">
        <button
          type="submit"
          title="Log out"
          className="h-11 w-11 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-50 hover:text-gray-600"
        >
          <LogoutIcon />
        </button>
      </form>
    </aside>
  );
}
