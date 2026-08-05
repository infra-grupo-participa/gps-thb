"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Users,
  BookOpen,
  FolderOpen,
  UserRound,
  CalendarClock,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** chave do ícone (string, serializável entre server e client). */
  icon?:
    | "inicio"
    | "clientes"
    | "materiais"
    | "pasta"
    | "perfil"
    | "alunos"
    | "reunioes";
  /** casa exatamente (para o "Início"). */
  exact?: boolean;
  /** contador de pendências ao lado do rótulo (ex.: solicitações a responder). */
  badge?: number;
}

const ICONES: Record<NonNullable<NavItem["icon"]>, LucideIcon> = {
  inicio: Home,
  clientes: Users,
  materiais: BookOpen,
  pasta: FolderOpen,
  perfil: UserRound,
  alunos: Users,
  reunioes: CalendarClock,
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
            // Sem prefetch: as abas ficam visíveis em toda tela e o Next
            // pré-buscava todas de uma vez. Como as rotas são dinâmicas, cada
            // pré-busca roda o proxy (getUser) e renderiza a página inteira —
            // a home sozinha dispara ~10 queries. Medido nos logs do Supabase.
            // Nada muda para o usuário: a rota carrega ao clicar.
            prefetch={false}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition " +
              (ativo
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
          >
            {Icon ? <Icon className="size-4" /> : null}
            {item.label}
            {item.badge ? (
              <span
                className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white"
                title={`${item.badge} aguardando resposta`}
              >
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
