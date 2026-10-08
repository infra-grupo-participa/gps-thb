import Link from "next/link";

import { GradeHorarios } from "@/components/sessoes/grade-horarios";
import { SemHorario } from "@/components/sessoes/sem-horario";
import { buttonVariants } from "@/components/ui/button";
import { formatarDataHora, formatarDataSoDia } from "@/lib/datas";
import { ROTULO_PRESENCA } from "@/lib/entrevista-previa-calculo";
import type { HorarioLivre, SessaoTipo } from "@/lib/sessoes-tipos";

/**
 * O passo depois da Entrevista Prévia: marcar a Reunião Preliminar (plano
 * 3.0, §3). Server Component SEM leitura — a página resolve tudo e entrega
 * aqui UM estado já decidido.
 *
 * Os 7 estados, e por que cada um existe:
 *   A   elegível, com horário → a grade de `/sessoes`, reusada sem cópia
 *   B   elegível, sem horário → `SemHorario` "sem-horario"
 *   C1  este cliente não é o acompanhado e não há outro elegível →
 *       `SemHorario` "nao-elegivel" (a 2ª frase dele já cobre "escolheu e
 *       ainda não abriu")
 *   C2  OUTRO cliente é o acompanhado → frase própria + link para a ficha dele
 *   C3  este É o acompanhado e a RPC recusou → a etapa não abriu
 *   D   já existe Reunião Preliminar viva → data/hora + Sessões
 *   E   uma leitura falhou → "não deu para conferir agora", nunca um veredito
 *
 * 🔴 E NUNCA CAI EM B OU C: afirmar "a equipe não tem horário" ou "escolha o
 * cliente" quando a consulta é que caiu é a mentira de 16/09.
 *
 * 🔑 A presença dos decisores é LEMBRETE, não trava (item c): o banner
 * aparece com a grade e nunca a esconde.
 */
export type EstadoAgendar =
  | {
      tipo: "A";
      sessaoTipo: SessaoTipo;
      horarios: HorarioLivre[];
      /** Já ocupados por outros alunos — só leitura na grade. */
      reservados: HorarioLivre[];
      clienteNome: string;
      /** `null` = a leitura dos decisores falhou. */
      decisores: { nomes: string[]; exigeTodos: boolean } | null;
      /** Resposta de `presenca_decisores` na entrevista do `?e=`, se houver. */
      presenca: string | null;
    }
  | {
      tipo: "B";
      /** Sem livres, mas com reservados a mostrar (só leitura). */
      reservadosNaGrade?: {
        sessaoTipo: SessaoTipo;
        clienteNome: string;
        reservados: HorarioLivre[];
      };
    }
  | { tipo: "C1" }
  | { tipo: "C2"; clienteAcompanhadoId: string }
  | { tipo: "C3"; nomeDoTipo: string | null; etapaDoTipo: number | null }
  | { tipo: "D"; inicioEm: string; outroCliente: boolean }
  | { tipo: "E" };

/** Janela default de `gps.sessao_horarios_livres` (8 semanas) — igual a `/sessoes`. */
const SEMANAS_DA_JANELA = 8;

/** Presença que pede reforço no banner: ainda não é "todos confirmam". */
const PRESENCA_INCERTA = new Set(["alguns", "a_confirmar", "nao"]);

function juntarE(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

export function EtapaAgendar({
  estado,
  clienteId,
  dataSugerida,
}: {
  estado: EstadoAgendar;
  clienteId: string;
  /**
   * `data_reuniao_preliminar` da ficha, de hoje em diante ("YYYY-MM-DD"), ou
   * `null`. Só aparece onde há grade a escolher (A) ou a falta dela (B).
   */
  dataSugerida: string | null;
}) {
  const sugestao = estado.tipo === "A" || estado.tipo === "B" ? dataSugerida : null;
  return (
    <div className="grid gap-6">
      {sugestao ? <BannerSugestao estado={estado} data={sugestao} /> : null}
      <Corpo estado={estado} dataSugerida={sugestao} />

      {/* As duas saídas valem em todo estado: marcar depois não perde nada
          (a entrevista já está concluída) e a ficha é de onde ele veio. Em D
          não há o que marcar — o link vira "Ver em Sessões". */}
      <div className="flex flex-wrap gap-2 border-t border-borda-fina pt-4">
        <Link href="/sessoes" className={buttonVariants({ variant: "outline" })}>
          {estado.tipo === "D" ? "Ver em Sessões" : "Marcar depois em Sessões"}
        </Link>
        <Link href={`/clientes/${clienteId}`} className={buttonVariants({ variant: "ghost" })}>
          Voltar para a ficha
        </Link>
      </div>
    </div>
  );
}

/**
 * "Sugestão: {dd/mm}, a data combinada na ficha" + se a equipe tem horário
 * livre nesse dia. Sem horário no dia, diz isso e a grade segue normal.
 */
function BannerSugestao({ estado, data }: { estado: EstadoAgendar; data: string }) {
  const ddmm = (formatarDataSoDia(data) ?? data).slice(0, 5);
  const temNoDia = estado.tipo === "A" && estado.horarios.some((h) => h.data === data);
  return (
    <div className="border border-borda-fina px-4 py-3">
      <p className="corpo-sm">
        <strong>Sugestão: {ddmm}</strong>, a data combinada na ficha.
      </p>
      <p className="corpo-sm mt-1 text-muted-foreground">
        {temNoDia
          ? "A equipe tem horário livre nesse dia — ele aparece primeiro na lista."
          : "A equipe não tem horário livre nesse dia. Escolha outro na lista ou combine outra data com o cliente."}
      </p>
    </div>
  );
}

function Corpo({ estado, dataSugerida }: { estado: EstadoAgendar; dataSugerida: string | null }) {
  switch (estado.tipo) {
    case "E":
      return (
        <p role="alert" className="border border-borda-fina px-4 py-4 corpo-sm text-destructive">
          Não deu para conferir agora se a Reunião Preliminar pode ser marcada.
          A entrevista já está salva. Atualize a página e tente de novo.
        </p>
      );

    case "D":
      return (
        <div className="border border-borda-fina px-4 py-4">
          <p className="corpo font-medium text-foreground">
            {estado.outroCliente
              ? "Já existe uma Reunião Preliminar marcada, para outro cliente:"
              : "A Reunião Preliminar já está marcada:"}{" "}
            {formatarDataHora(estado.inicioEm)}.
          </p>
          <p className="mt-1 corpo-sm text-muted-foreground">
            O link da sala, o cancelamento e os lembretes ficam em Sessões.
          </p>
        </div>
      );

    case "C2":
      return (
        <div className="border border-borda-fina px-4 py-4">
          <p className="corpo font-medium text-foreground">
            A Reunião Preliminar pelo sistema é marcada para o cliente que a
            equipe acompanha. Este não é ele.
          </p>
          <div className="mt-3">
            <Link
              href={`/clientes/${estado.clienteAcompanhadoId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Abrir a ficha do cliente acompanhado
            </Link>
          </div>
        </div>
      );

    case "C1":
      return <SemHorario motivo="nao-elegivel" semanas={SEMANAS_DA_JANELA} />;

    case "C3":
      return (
        <SemHorario
          motivo="etapa-fechada"
          semanas={SEMANAS_DA_JANELA}
          // Sem `href`: a Entrevista acabou de ser feita, oferecê-la como
          // "o que dá para adiantar" seria mandar fazer de novo.
          href={null}
          nomeDoTipo={estado.nomeDoTipo}
          etapaDoTipo={estado.etapaDoTipo}
        />
      );

    case "B":
      return (
        <div className="grid gap-4">
          <SemHorario
            motivo="sem-horario"
            semanas={SEMANAS_DA_JANELA}
            temReservados={(estado.reservadosNaGrade?.reservados.length ?? 0) > 0}
          />
          {estado.reservadosNaGrade?.reservados.length ? (
            <GradeHorarios
              tipo={estado.reservadosNaGrade.sessaoTipo}
              horarios={[]}
              reservados={estado.reservadosNaGrade.reservados}
              clienteNome={estado.reservadosNaGrade.clienteNome}
            />
          ) : null}
        </div>
      );

    case "A":
      return (
        <div className="grid gap-4">
          <BannerDecisores decisores={estado.decisores} presenca={estado.presenca} />
          <GradeHorarios
            tipo={estado.sessaoTipo}
            horarios={estado.horarios}
            reservados={estado.reservados}
            diaPrimeiro={dataSugerida}
            clienteNome={estado.clienteNome}
          />
        </div>
      );
  }
}

function BannerDecisores({
  decisores,
  presenca,
}: {
  decisores: { nomes: string[]; exigeTodos: boolean } | null;
  presenca: string | null;
}) {
  if (decisores === null) {
    return (
      <p role="alert" className="border border-borda-fina px-4 py-3 corpo-sm text-destructive">
        Não deu para conferir agora quem decide junto. Se alguém decide com o
        cliente, a reunião só acontece com essa pessoa presente.
      </p>
    );
  }
  if (!decisores.exigeTodos) return null;

  const incerta = presenca !== null && PRESENCA_INCERTA.has(presenca);
  return (
    <div
      className={
        "px-4 py-3 " +
        (incerta ? "border border-borda-forte bg-superficie-afundada" : "border border-borda-fina")
      }
    >
      <p className="corpo-sm">
        A Reunião Preliminar só acontece com{" "}
        <strong>{decisores.nomes.length ? juntarE(decisores.nomes) : "todos os decisores"}</strong>{" "}
        presentes.
      </p>
      {incerta ? (
        <p className="corpo-sm mt-1 font-medium">
          Na entrevista: {ROTULO_PRESENCA[presenca] ?? presenca}. Confirme a
          presença de todos antes de escolher o horário.
        </p>
      ) : null}
    </div>
  );
}
