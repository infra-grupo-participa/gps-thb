"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  BookOpen,
  FolderOpen,
  UserRound,
  NotebookPen,
  Wallet,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

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
    | "diario"
    | "financeiro"
    | "suporte";
  /** casa exatamente (para o "Início"). */
  exact?: boolean;
  /** Item exclusivo do admin — some na pré-visualização. */
  adminOnly?: boolean;
  /**
   * Contador ao lado do rótulo (ex.: chamados esperando a equipe). `undefined`
   * = a página não sabe o número; 0 = sabe e é zero, e aí a pílula NÃO aparece
   * (badge com "0" é ruído: alerta é fila, não informação).
   *
   * 🔑 Quem passa é a página, e só quando já tem o número em mãos — nunca
   * vale uma consulta a mais só para pintar a aba.
   */
  badge?: number;
}

const ICONES: Record<NonNullable<NavItem["icon"]>, LucideIcon> = {
  inicio: Home,
  clientes: Users,
  materiais: BookOpen,
  pasta: FolderOpen,
  perfil: UserRound,
  alunos: Users,
  diario: NotebookPen,
  financeiro: Wallet,
  suporte: LifeBuoy,
};

export function NavTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    // `w-max` para o contêiner rolável do header medir a largura real das abas
    // em vez de espremê-las (o pior caso é 7 abas em 360 px).
    <nav className="flex w-max items-center gap-1">
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
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition",
              ativo
                // `text-primary` (#FF6300) sobre `bg-primary/10` dava 2,9:1 —
                // reprova em texto de 14 px. O par accent do próprio tema
                // (#B04300 sobre #FFEDD5) é o mesmo laranja com 5,9:1.
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              item.adminOnly && "previa-oculta",
            )}
          >
            {Icon ? <Icon className="size-4" /> : null}
            {item.label}
            {item.badge && item.badge > 0 ? (
              <Badge variant="secondary" className="text-[10px]">
                {item.badge}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
