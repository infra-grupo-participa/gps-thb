"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  BookOpen,
  FolderOpen,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** chave do ícone (string, serializável entre server e client). */
  icon?: "inicio" | "clientes" | "materiais" | "pasta" | "perfil";
  /** casa exatamente (para o "Início"). */
  exact?: boolean;
}

const ICONES: Record<NonNullable<NavItem["icon"]>, LucideIcon> = {
  inicio: Home,
  clientes: Users,
  materiais: BookOpen,
  pasta: FolderOpen,
  perfil: UserRound,
};

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const ativo = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon ? ICONES[item.icon] : null;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition " +
              (ativo
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {Icon ? <Icon className="size-4" /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
