import type { NavItem } from "@/components/nav-tabs";

/**
 * Abas de navegação do aluno. basePath = "" para o aluno logado;
 * "/admin/aluno/<id>" para o admin no modo assistência.
 */
export function alunoNavItems(basePath: string): NavItem[] {
  return [
    { href: basePath || "/", label: "Início", icon: "inicio", exact: true },
    { href: `${basePath}/clientes`, label: "Clientes", icon: "clientes" },
    { href: `${basePath}/pasta`, label: "Pasta", icon: "pasta" },
    { href: `${basePath}/materiais`, label: "Materiais", icon: "materiais" },
    { href: `${basePath}/perfil`, label: "Perfil", icon: "perfil" },
  ];
}

/**
 * Abas do painel do admin (nível topo, não o modo assistência do aluno).
 * `pendentes` = solicitações de reunião esperando resposta; vira um contador na
 * aba Reuniões para que nenhum aluno fique aguardando sem ninguém ver.
 */
export function adminNavItems(pendentes = 0): NavItem[] {
  return [
    { href: "/admin", label: "Alunos", icon: "alunos", exact: true },
    {
      href: "/admin/reunioes",
      label: "Reuniões",
      icon: "reunioes",
      badge: pendentes || undefined,
    },
  ];
}
