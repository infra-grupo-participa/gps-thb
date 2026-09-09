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
    // em vez de espremê-las (o pior caso é 8 abas em 360 px).
    <nav className="flex w-max items-stretch gap-0.5">
      {items.map((item) => {
        const ativo = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon ? ICONES[item.icon] : null;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            // Sem prefetch: as abas ficam visíveis em toda tela e o Next
            // pré-buscava todas de uma vez. Como as rotas são dinâmicas, cada
            // pré-busca roda o proxy (getUser) e renderiza a página inteira —
            // a home sozinha dispara ~10 queries. Medido nos logs do Supabase.
            // Nada muda para o usuário: a rota carrega ao clicar.
            prefetch={false}
            className={cn(
              // RÉGUA de 2 px, não pílula. A pílula `bg-accent` passava no
              // contraste mas a aba ativa e a inativa tinham quase o mesmo
              // peso visual a 1366 px — não dava para dizer onde se está.
              // A régua é inequívoca e some da área do texto.
              "foco-visivel -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
              ativo
                ? "border-primary font-semibold text-foreground [&>svg]:text-accent-foreground"
                : "border-transparent font-medium text-muted-foreground hover:border-borda-forte hover:text-foreground",
              item.adminOnly && "previa-oculta",
            )}
          >
            {Icon ? <Icon className="size-4" aria-hidden /> : null}
            {item.label}
            {item.badge && item.badge > 0 ? (
              <Badge variant="danger" icone={false} className="h-5 px-1.5 text-[10px]">
                {item.badge}
              </Badge>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
