/**
 * Tabela da lista consolidada de clientes — SOMENTE LEITURA.
 *
 * 🔴 TABELA NOVA, separada de `clientes-manager/clientes-tabela.tsx` de
 * propósito: aquela tem um `<Select>` do Base UI POR LINHA (troca de fase) e
 * foi desenhada para o CRM do aluno, com no máximo ~30 clientes por ambiente.
 * Aqui a página inteira já pode ter 100 linhas — 100 instâncias de um
 * componente com portal travariam a aba. Zero componente Radix/Base UI por linha.
 *
 * 🔴 SEM ROLAGEM LATERAL (03/10/2026 e 06/10/2026, João): as quatro datas da
 * agenda (Entrevista, Preliminar, Croqui, Execução) são o status do pessoal e
 * precisam caber sem arrastar para o lado. Para abrir espaço, parceiro,
 * telefone e grau/DISC deixaram de ser colunas e viraram a 2ª linha da célula
 * do cliente. Conta a 1366 px (container útil ≈1.088): colunas fixas
 * 7 + 4×6 + 5,5 = 36,5rem + 6 vãos de 0,75rem ≈ 656 px → sobram ≈ 390 px
 * para o cliente. No estreito (<lg) a linha vira cartão com grade 2×2.
 *
 * (…378, 08/10/2026) + coluna "Documentos" (minuta e croqui em PDF), 9,5rem +
 * 1 vão = 164 px → o cliente fica com ≈ 266 px a 1366 px (nome trunca com
 * `title`). O selo mostra estado curto ("A revisar"); data e autor vão no
 * `title` e no texto de leitor de tela, não numa 2ª linha.
 */

import { Fragment } from "react";
import Link from "next/link";
import { Check, CircleAlert, Hourglass, Star, X } from "lucide-react";
import type {
  ClienteDoPrograma,
  EstadoReuniao,
  StatusAnexo,
} from "@/lib/data/clientes-admin";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { FUSO } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { CopiarContato } from "@/components/admin/copiar-contato";
import { cn } from "@/lib/utils";
import { formatarNome } from "@/lib/nomes";

/** `cliente.id` → texto pronto ("há 2 h") + data completa para o `title`. */
export type PastaPorCliente = Record<string, { rotulo: string; titulo: string }>;

/** Rótulo curto das 4 reuniões — o mesmo no cabeçalho e no cartão. */
const REUNIOES = [
  { chave: "ep", rotulo: "Entrevista" },
  { chave: "rp", rotulo: "Preliminar" },
  // (…378) A REUNIÃO do croqui — o PDF do croqui está em "Documentos".
  { chave: "cq", rotulo: "Reunião do croqui" },
  { chave: "ex", rotulo: "Execução" },
] as const;

export function TabelaClientesPrograma({
  linhas,
  pasta,
}: {
  linhas: ClienteDoPrograma[];
  pasta?: PastaPorCliente;
}) {
  // 🔑 (28/09/2026, Marcio) Estrela primeiro — a RPC já devolve os com estrela
  // no topo. Aqui só se marca a FRONTEIRA entre os dois grupos.
  const comFaixas =
    linhas.some((l) => l.acompanhadoEquipe) && linhas.some((l) => !l.acompanhadoEquipe);
  return (
    <div className="rounded-xl border bg-card">
      <div
        aria-hidden
        className={cn(
          COLUNAS,
          "hidden gap-x-3 border-b px-4 py-2 text-xs font-medium text-muted-foreground lg:grid",
        )}
      >
        <span>Cliente</span>
        <span>Fase</span>
        {REUNIOES.map((r) => (
          <span key={r.chave}>{r.rotulo}</span>
        ))}
        <span>Documentos</span>
        <span>Pasta</span>
      </div>
      <ul className="divide-y">
        {linhas.map((c, i) => {
          const faixa =
            comFaixas && (i === 0 || linhas[i - 1].acompanhadoEquipe !== c.acompanhadoEquipe)
              ? c.acompanhadoEquipe
                ? "Com estrela — prioridade da equipe"
                : "Sem estrela — menor prioridade"
              : null;
          const fase = FASES_CLIENTE.find((f) => f.id === c.fase);
          const grau = c.grauRelacao
            ? GRAUS_RELACAO_UI.find((g) => g.id === c.grauRelacao)?.rotulo
            : null;
          const grauDisc = [grau, c.perfilDisc].filter(Boolean).join(" · ");
          const nome = formatarNome(c.clienteNome) || "Sem nome";
          const datas = {
            ep: { em: c.epEm, estado: c.epEstado },
            rp: { em: c.rpEm, estado: c.rpEstado },
            cq: { em: c.cqEm, estado: c.cqEstado },
            ex: { em: c.exEm, estado: c.exEstado },
          };
          const seloFase = (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                fase?.cor ?? "bg-neutro text-neutro-foreground",
              )}
            >
              {fase?.rotulo ?? c.fase}
            </span>
          );
          return (
            <Fragment key={c.id}>
              {faixa ? (
                <li className="rotulo bg-superficie-afundada px-4 py-1.5 text-muted-foreground">
                  {faixa}
                </li>
              ) : null}
              {/* Com estrela: fundo de marca + filete à esquerda + nome em
                  negrito. Sem estrela: tom apagado (token, nunca `opacity`). */}
              <li
                className={cn(
                  "flex flex-col gap-1.5 px-4 py-2.5 text-sm lg:grid lg:items-center lg:gap-x-3 lg:gap-y-0",
                  COLUNAS,
                  c.acompanhadoEquipe
                    ? "bg-primary/5 shadow-[inset_3px_0_0_var(--color-primary)]"
                    : "text-muted-foreground",
                )}
              >
                {/* Cliente: nome (+ fase só no estreito) / parceiro · telefone · grau/DISC */}
                <div className="grid min-w-0 gap-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-1.5",
                        c.acompanhadoEquipe ? "font-semibold text-foreground" : "font-normal",
                      )}
                    >
                      {c.acompanhadoEquipe ? (
                        <Star
                          aria-label="Acompanhado pela equipe"
                          className="size-3.5 shrink-0 fill-primary text-primary"
                        />
                      ) : null}
                      <Link
                        href={`/admin/aluno/${c.alunoId}/clientes/${c.id}`}
                        className="truncate underline-offset-2 hover:underline focus-visible:underline"
                        title={`Abrir a ficha de ${nome}`}
                      >
                        {nome}
                      </Link>
                    </div>
                    <span className="shrink-0 lg:hidden">{seloFase}</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-x-1.5 text-xs text-muted-foreground">
                    <Link
                      href={`/admin/aluno/${c.alunoId}`}
                      className="min-w-0 truncate font-medium text-accent-foreground underline decoration-accent-foreground/40 underline-offset-2 hover:decoration-accent-foreground"
                      title={c.parceiroNome ? `Abrir a ficha do parceiro ${c.parceiroNome}` : undefined}
                    >
                      <span className="sr-only">Parceiro: </span>
                      {formatarNome(c.parceiroNome) || "—"}
                    </Link>
                    {c.telefone ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="shrink-0 whitespace-nowrap">
                          <CopiarContato
                            valor={c.telefone}
                            rotuloAcessivel={`Copiar telefone de ${nome}`}
                            formatar={mascaraTelefone}
                          />
                        </span>
                      </>
                    ) : null}
                    {grauDisc ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="min-w-0 truncate" title={grauDisc}>
                          {grauDisc}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <span className="hidden lg:block">{seloFase}</span>

                {/* Estreito: grade 2×2 (+ pasta). Largo: `contents` — cada
                    célula vira coluna da linha. */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 lg:contents">
                  {REUNIOES.map((r) => (
                    <CelulaData
                      key={r.chave}
                      rotulo={r.rotulo}
                      em={datas[r.chave].em}
                      estado={datas[r.chave].estado}
                    />
                  ))}
                  <div className="col-span-2 flex flex-wrap gap-x-4 gap-y-0.5 lg:col-span-1 lg:grid lg:gap-0.5">
                    <SeloAnexo
                      tipo="Croqui"
                      status={c.cqPdfStatus}
                      em={c.cqPdfEm}
                      porEquipe={c.cqPdfPorEquipe}
                    />
                    <SeloAnexo
                      tipo="Minuta"
                      status={c.mnStatus}
                      em={c.mnEm}
                      porEquipe={c.mnPorEquipe}
                    />
                  </div>
                  <span
                    className="whitespace-nowrap text-xs text-muted-foreground lg:text-sm"
                    title={pasta?.[c.id]?.titulo}
                  >
                    <span className="lg:sr-only">Pasta </span>
                    {pasta?.[c.id]?.rotulo ?? "—"}
                  </span>
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Uma data da agenda. Estado por ícone + texto, nunca só cor:
 * agendada = só a data · pendente = data + "não concluída" (âmbar) ·
 * realizada = data + ✓ · faltou = data + "faltou" · sem sessão = "—".
 */
function CelulaData({
  rotulo,
  em,
  estado,
}: {
  rotulo: string;
  em: string | null;
  estado: EstadoReuniao | null;
}) {
  const data = dataCurta(em);
  return (
    <div className="min-w-0 tabular-nums">
      <span className="text-xs text-muted-foreground lg:sr-only">{rotulo} </span>
      {data ? (
        <>
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap",
              estado === "pendente" && "text-atencao-foreground",
              estado === "faltou" && "text-risco-foreground",
            )}
          >
            {data}
            {estado === "realizada" ? (
              <Check aria-hidden className="size-3.5 shrink-0 text-sucesso-foreground" />
            ) : null}
            <span className="sr-only">{estado ? `, ${ROTULO_ESTADO[estado]}` : ""}</span>
          </span>
          {estado === "pendente" || estado === "faltou" ? (
            <span
              aria-hidden
              className={cn(
                "flex items-center gap-0.5 text-xs whitespace-nowrap",
                estado === "pendente" ? "text-atencao-foreground" : "text-risco-foreground",
              )}
            >
              {estado === "pendente" ? (
                <CircleAlert className="size-3 shrink-0" />
              ) : (
                <X className="size-3 shrink-0" />
              )}
              {ROTULO_ESTADO[estado]}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span aria-hidden>—</span>
          <span className="sr-only">sem data</span>
        </>
      )}
    </div>
  );
}

/** Rótulo VISÍVEL (curto, cabe em 9,5rem a 14 px) e o completo (title/leitor). */
const ROTULO_ANEXO: Record<StatusAnexo, { curto: string; completo: string }> = {
  enviada: { curto: "A revisar", completo: "aguardando revisão" },
  em_analise: { curto: "Em análise", completo: "em análise" },
  revisada: { curto: "Revisada", completo: "revisada" },
};

/** Gênero por tipo: minuta é feminino, croqui é masculino. */
const ROTULO_REVISADO: Record<"Minuta" | "Croqui", { curto: string; completo: string }> = {
  Minuta: { curto: "Revisada", completo: "revisada" },
  Croqui: { curto: "Revisado", completo: "revisado" },
};

const FORMATO_DIA_MES = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: FUSO,
});

/**
 * Selo de UM documento (minuta ou croqui em PDF, versão mais recente — …378).
 * Estado por ÍCONE + TEXTO, nunca só cor: sem anexo = "—" · enviada = alerta
 * + "A revisar" (âmbar, pede ação) · em análise = ampulheta · revisada = ✓.
 * Texto em 14 px (`text-sm`). Data (dd/mm) e quem anexou: `title` + sr-only.
 */
function SeloAnexo({
  tipo,
  status,
  em,
  porEquipe,
}: {
  tipo: "Minuta" | "Croqui";
  status: StatusAnexo | null;
  em: string | null;
  porEquipe: boolean | null;
}) {
  if (!status) {
    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap text-sm">
        <span className="w-12 shrink-0 text-muted-foreground">{tipo}</span>
        <span aria-hidden className="text-muted-foreground">—</span>
        <span className="sr-only">
          {tipo === "Minuta" ? "sem minuta anexada" : "sem croqui anexado"}
        </span>
      </div>
    );
  }
  const d = em ? new Date(em) : null;
  const dia = d && !Number.isNaN(d.getTime()) ? FORMATO_DIA_MES.format(d) : null;
  const autor = porEquipe === null ? null : porEquipe ? "pela equipe" : "pelo parceiro";
  const rotulo = status === "revisada" ? ROTULO_REVISADO[tipo] : ROTULO_ANEXO[status];
  const detalhe = [
    dia ? `${tipo === "Minuta" ? "enviada" : "enviado"} em ${dia}` : null,
    autor,
  ]
    .filter(Boolean)
    .join(" ");
  const descricao = `${tipo}: ${rotulo.completo}${detalhe ? ` · ${detalhe}` : ""}`;
  const Icone = status === "revisada" ? Check : status === "em_analise" ? Hourglass : CircleAlert;
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap text-sm" title={descricao}>
      <span className="w-12 shrink-0 text-muted-foreground">{tipo}</span>
      <span
        aria-hidden
        className={cn(
          "inline-flex items-center gap-1",
          status === "enviada" && "font-medium text-atencao-foreground",
          status === "em_analise" && "text-foreground",
          status === "revisada" && "text-sucesso-foreground",
        )}
      >
        <Icone className="size-3.5 shrink-0" />
        {rotulo.curto}
      </span>
      <span className="sr-only">{descricao}</span>
    </div>
  );
}

const ROTULO_ESTADO: Record<EstadoReuniao, string> = {
  agendada: "agendada",
  pendente: "não concluída",
  realizada: "realizada",
  faltou: "faltou",
};

const RE_SO_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_CURTO = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: FUSO,
});

/**
 * ISO → "06/10/26". `date` puro ("2026-10-06") por recorte de string (sem
 * `Date`, que viraria o dia em UTC — ver `formatarDataSoDia`); `timestamptz`
 * pelo fuso de São Paulo. Inválido → `null` (célula mostra "—").
 */
function dataCurta(iso: string | null): string | null {
  if (!iso) return null;
  const m = RE_SO_DIA.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : FORMATO_CURTO.format(d);
}

/** As oito colunas em tela larga — o cabeçalho e cada linha usam a mesma. */
const COLUNAS =
  "lg:grid-cols-[minmax(0,1fr)_7rem_6rem_6rem_6rem_6rem_9.5rem_5.5rem]";
