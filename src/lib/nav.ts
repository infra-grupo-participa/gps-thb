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

/** Abas do painel do admin (nível topo, não o modo assistência do aluno). */
export function adminNavItems(): NavItem[] {
  return [{ href: "/admin", label: "Alunos", icon: "alunos", exact: true }];
}
