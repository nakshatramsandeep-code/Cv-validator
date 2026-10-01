"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/upload", label: "Upload CVs" },
];

export default function Nav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 flex items-center gap-1 h-12">
        <span className="font-semibold text-sm mr-4">Kargo Hiring</span>
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              "px-3 py-1.5 text-sm rounded-md",
              pathname === link.href
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            )}
          >
            {link.label}
          </Link>
        ))}
        <form action="/api/logout" method="post" className="ml-auto">
          <button className="text-sm text-gray-500 hover:text-gray-900" type="submit">
            Log out
          </button>
        </form>
      </div>
    </nav>
  );
}
