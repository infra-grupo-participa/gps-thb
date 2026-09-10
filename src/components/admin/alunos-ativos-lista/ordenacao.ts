/**
 * Contagem de dias, filtro e ordenação da lista de alunos do painel — sem
 * React, sem JSX, testáveis. Saíram de `alunos-ativos-lista.tsx` no corte da
 * Onda 3 (CD5): é o único lugar do repo com lógica de ordenação não trivial e
 * até aqui ela não dava para testar.
 *
 * 🔑 As três regras que este arquivo existe para não deixar ninguém quebrar:
 * 1. dia é dia de CALENDÁRIO em Brasília, não 24h — acesso às 23h de ontem é
 *    "ontem";
 * 2. ausência de data vai SEMPRE para o fim, nas duas direções — "sem nota"
 *    não pode se disfarçar de "nota antiquíssima";
 * 3. todo empate desempata por nome, senão a lista dança entre renders.
 */

import type { AlunoGps, AtendimentoDoAluno } from "@/lib/data";
import { semAcento } from "@/lib/texto";
import { FUSO } from "@/lib/datas";
import { brl, brlCompacto } from "@/lib/moeda";
import { DIAS_NOTA_RECENTE, type OrdemAlunos } from "./tipos";

/** "YYYY-MM-DD" no fuso de Brasília — base para contar dias de CALENDÁRIO.
 *
 * Cliente e servidor formatam no MESMO fuso (`FUSO`, de `@/lib/datas`): sem
 * isto o SSR (UTC) e o navegador (BRT) divergem em toda data depois das 21h e
 * a hidratação quebra. */
const fmtDiaIso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Número do dia (epoch/86400s) no fuso de Brasília. */
export function diaLocal(data: Date): number {
  const [ano, mes, dia] = fmtDiaIso.format(data).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 86_400_000;
}

/**
 * Dias de calendário entre `iso` e `agora`, em Brasília. Conta DIA, não 24h:
 * um acesso às 23h de ontem é "ontem", nunca "hoje".
 */
export function diasDesde(iso: string, agora: number): number {
  return diaLocal(new Date(agora)) - diaLocal(new Date(iso));
}

/** `null` = nunca entrou. Nunca "—", nunca a data de cadastro no lugar. */
export function descreverAcesso(iso: string | null, agora: number): string {
  if (!iso) return "nunca entrou";
  const dias = diasDesde(iso, agora);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** Dias sem acessar; `null` (nunca entrou) conta como infinito. */
export function diasSemAcesso(iso: string | null, agora: number): number {
  return iso ? diasDesde(iso, agora) : Number.POSITIVE_INFINITY;
}

/**
 * O que o card mostra na coluna de honorários — e o que ele DIZ.
 *
 * 🔑 As colunas nasceram NULL (migração ...090). "R$ 0,00" aqui seria uma
 * afirmação sobre o faturamento de gente real feita em cima de campo recém
 * criado. Por isso ausência é sempre "—", e o `title`/`sr-only` explica QUAL
 * ausência: nenhum contratado, ou contratado sem valor registrado.
 */
export function honorariosDoCard(
  total: number | null,
  contratados: number,
  semValor: number,
): { visual: string; descricao: string } {
  if (contratados === 0) {
    return { visual: "—", descricao: "Nenhum cliente contratado" };
  }
  const plural = contratados === 1 ? "contratado" : "contratados";
  if (total === null) {
    return {
      visual: "—",
      descricao: `${contratados} ${plural}, nenhum com honorários registrados`,
    };
  }
  const base = `${brl(total)} em ${contratados} ${plural}`;
  return {
    // Compacto ("R$ 42 mil") é número de COMPARAÇÃO — o exato vai no `title`
    // e no texto do leitor de tela, logo abaixo.
    visual: brlCompacto(total),
    descricao:
      semValor > 0
        ? `${base} · ${semValor} ainda sem valor registrado`
        : base,
  };
}

/** Nota escrita nos últimos 7 dias de CALENDÁRIO. Sem nota nenhuma = `false`. */
export function notaRecente(iso: string | null | undefined, agora: number): boolean {
  return iso ? diasDesde(iso, agora) <= DIAS_NOTA_RECENTE : false;
}

/**
 * Ordena a lista JÁ filtrada. "recentes" devolve o array recebido sem copiar:
 * é a ordem em que o servidor mandou (mais recente primeiro).
 */
export function ordenarAlunos(
  filtrados: AlunoGps[],
  ordem: OrdemAlunos,
  atendimentoPorAluno: Record<string, AtendimentoDoAluno>,
): AlunoGps[] {
  // Empate sempre desempatado por nome: sem isso a lista dança entre
  // renders, porque `sort` não é estável para chaves iguais em toda engine.
  const porNome = (a: AlunoGps, b: AlunoGps) =>
    semAcento(a.aluno?.nome ?? "").localeCompare(
      semAcento(b.aluno?.nome ?? ""),
      "pt-BR",
    );

  // Quem não tem data vai SEMPRE para o fim, nas duas direções: ausência de
  // dado não é "o mais antigo" nem "o mais recente".
  const porData = (
    a: string | null,
    b: string | null,
    direcao: "asc" | "desc",
  ): number | null => {
    if (!a && !b) return null;
    if (!a) return 1;
    if (!b) return -1;
    const ta = Date.parse(a);
    const tb = Date.parse(b);
    if (ta === tb) return null;
    return direcao === "asc" ? ta - tb : tb - ta;
  };

  // "recentes" é a ordem em que o array chegou (mais recente primeiro):
  // não reordenar.
  if (ordem === "recentes") return filtrados;

  return [...filtrados].sort((a, b) => {
    if (ordem === "nome") return porNome(a, b);
    if (ordem === "progresso") return b.pct - a.pct || porNome(a, b);
    if (ordem === "tempo_de_casa") {
      // Mais tempo de casa = entrou antes = `desde` crescente.
      return porData(a.desde, b.desde, "asc") ?? porNome(a, b);
    }
    if (ordem === "ultimo_acesso") {
      return porData(a.ultimoAcesso, b.ultimoAcesso, "desc") ?? porNome(a, b);
    }
    if (ordem === "honorarios") {
      // Maior primeiro; quem não tem valor vai SEMPRE para o fim (não é
      // "R$ 0", é ausência de dado). Desempate por nome, como nas demais.
      const va = a.honorariosContratados;
      const vb = b.honorariosContratados;
      if (va == null && vb == null) return porNome(a, b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va || porNome(a, b);
    }
    if (ordem === "nota_recente") {
      // Quem não tem nota vai para o fim — é o mesmo `porData`, então
      // "sem nota" nunca se disfarça de "nota antiquíssima".
      return (
        porData(
          atendimentoPorAluno[a.alunoId]?.ultimaNotaEm ?? null,
          atendimentoPorAluno[b.alunoId]?.ultimaNotaEm ?? null,
          "desc",
        ) ?? porNome(a, b)
      );
    }
    return b.clientesPreenchidos - a.clientesPreenchidos || porNome(a, b);
  });
}
