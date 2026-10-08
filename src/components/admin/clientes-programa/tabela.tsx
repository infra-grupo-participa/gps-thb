/**
 * Tabela da lista consolidada de clientes — SOMENTE LEITURA.
 *
 * 🔴 TABELA NOVA, separada de `clientes-manager/clientes-tabela.tsx` de
 * propósito: aquela tem um `<Select>` do Base UI POR LINHA (troca de fase) e
 * foi desenhada para o CRM do aluno, com no máximo ~30 clientes por ambiente.
 * Aqui a página inteira já pode ter 100 linhas — 100 instâncias de um
 * componente com portal travariam a aba. Zero componente Radix/Base UI por linha.
 *
 * 🔴 SEM ROLAGEM LATERAL, SEM VÃO (03/10, 06/10 e 08/10/2026): as quatro datas
 * da agenda são o status do pessoal e precisam caber sem arrastar para o lado.
 * Parceiro, telefone e grau/DISC são linhas 2 e 3 da célula do cliente.
 * Container da página: `max-w-[1600px]` (o mesmo do gerador). Colunas: cliente
 * `minmax(16rem,28rem)` (NÃO absorve a sobra), fase 7rem fixa e as 6 restantes
 * (4 datas, Documentos, Pasta) em `fr` com mínimo de 6/9,5/5,5rem — a sobra se
 * reparte entre elas. Conta a 1366 px (útil ≈1.302): 28 + 7 + 6 colunas ≥ 38,5
 * = 73,5rem + 7 vãos de 0,75rem ≈ 1.260 px, sem sobra grande; a 1920 px o
 * container trava em 1.600 (útil 1.568) e as colunas em `fr` crescem juntas.
 * No estreito (<lg) a linha vira cartão com grade 2×2.
 *
 * Documentos (…378): só se mostra o anexo que existe (croqui antes da minuta);
 * sem nenhum, um marcador vazio. Estrela mantém fundo próprio também no hover.
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
          "hidden items-end gap-x-3 border-b px-4 py-2 text-xs leading-tight font-medium text-muted-foreground lg:grid",
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
                  "flex flex-col gap-1.5 px-4 py-3 text-sm transition-colors lg:grid lg:items-center lg:gap-x-3 lg:gap-y-0",
                  COLUNAS,
                  c.acompanhadoEquipe
                    ? "bg-primary/5 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-muted/60",
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
                  <div className="min-w-0 text-xs">
                    <Link
                      href={`/admin/aluno/${c.alunoId}`}
                      className="block min-w-0 font-medium text-accent-foreground underline decoration-accent-foreground/40 underline-offset-2 hover:decoration-accent-foreground"
                      title={c.parceiroNome ? `Abrir a ficha do parceiro ${c.parceiroNome}` : undefined}
                    >
                      Aluno: {formatarNome(c.parceiroNome) || "sem nome"}
                    </Link>
                  </div>
                  {c.telefone || grauDisc ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      {c.telefone ? (
                        <span className="shrink-0 whitespace-nowrap">
                          <CopiarContato
                            valor={c.telefone}
                            rotuloAcessivel={`Copiar telefone de ${nome}`}
                            formatar={mascaraTelefone}
                          />
                        </span>
                      ) : null}
                      {c.telefone && grauDisc ? <span aria-hidden>·</span> : null}
                      {grauDisc ? <span className="min-w-0">{grauDisc}</span> : null}
                    </div>
                  ) : null}
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
                    {!c.cqPdfStatus && !c.mnStatus ? (
                      <Vazio texto="sem anexo" />
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                  <span
                    className="whitespace-nowrap text-xs text-muted-foreground lg:text-sm"
                    title={pasta?.[c.id]?.titulo}
                  >
                    <span className="lg:sr-only">Pasta </span>
                    {pasta?.[c.id]?.rotulo ?? <Vazio texto="sem pasta" />}
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
        <Vazio texto="sem data" />
      )}
    </div>
  );
}

/** Vazio discreto: o que tem conteúdo salta aos olhos. */
function Vazio({ texto }: { texto: string }) {
  return (
    <>
      <span aria-hidden className="text-muted-foreground/50">
        ·
      </span>
      <span className="sr-only">{texto}</span>
    </>
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
  if (!status) return null; // Só se mostra o que existe.
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
  "lg:grid-cols-[minmax(16rem,28rem)_7rem_repeat(4,minmax(6rem,1fr))_minmax(9.5rem,1.3fr)_minmax(5.5rem,1fr)]";
