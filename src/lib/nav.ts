import type { NavItem } from "@/components/nav-tabs";

/**
 * Abas de navegação do aluno. basePath = "" para o aluno logado;
 * "/admin/aluno/<id>" para o admin no modo assistência.
 */
export function alunoNavItems(basePath: string): NavItem[] {
  return [
    { href: basePath || "/", label: "Início", exact: true },
    { href: `${basePath}/clientes`, label: "Clientes" },
  ];
}
