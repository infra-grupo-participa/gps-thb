"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { agendarSessao } from "@/app/sessoes/actions";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  agruparPorDia,
  formatarDuracao,
  horaDeTime,
  horaFimDeBloco,
} from "@/components/sessoes/grade";
import type { HorarioLivre, SessaoTipo } from "@/lib/sessoes-tipos";

/** Quantos dias a grade mostra de início, e quantos cada "Ver mais" soma. */
const DIAS_POR_VEZ = 5;

/**
 * A GRADE: os horários que a equipe **já declarou que pode**, para o aluno
 * escolher um.
 *
 * 🔴 REGRA DE UI DO MARCIO, LITERAL (PRD §7.1):
 *   *"não tem que exibir uma data para ele escolher, tem que exibir as opções
 *   de horário"*
 * Por isso não existe date-picker, nem calendário, nem campo de data nesta
 * tela. Só os blocos publicados, em lista cronológica. Um seletor de data
 * convidaria o aluno a escolher um dia que não existe na grade e devolveria
 * "nada aqui" — que é a mesma frustração do modelo removido em 10/08.
 *
 * 🔴 DENSO E CHAPADO (preferência do Marcio, `CLAUDE.md`): hierarquia por
 * POSIÇÃO. Cada DIA é UMA linha com borda fina, não um card com sombra: o
 * dia à esquerda (em cima, no celular) e os horários dele à direita, como
 * botões lado a lado com a hora de início — é o que o aluno procura. Duração
 * e responsável, quando iguais na grade inteira, são escritos UMA vez acima
 * dela; só o que varia desce para o botão. Sem ícone decorativo, sem
 * tipografia grande, sem cor de estado — esta é uma tela que se lê SENTADO,
 * não de relance. Nada aqui é a exceção da tela ao vivo de outro sistema.
 *
 * 🔴 POR QUE UMA LINHA POR DIA, E NÃO UMA POR HORÁRIO (05/10/2026): com um
 * horário por linha, Entrevista Prévia (~5/dia) + Reunião Preliminar (2/dia)
 * por ~2 meses deram 15.000 px de página — o parceiro (público mais velho,
 * pouca tecnologia) rolava demais para agendar. Pelo mesmo motivo só os
 * primeiros `DIAS_POR_VEZ` dias aparecem; "Ver mais dias" acrescenta, nunca
 * esconde os que já estão na tela. Botão com 44 px de altura e texto de
 * 16 px: alvo e leitura para quem tem pouca intimidade com tela.
 *
 * 🔴 O BLOCO É DE 2h30 E O ALUNO PRECISA SABER DISSO — mas o número NUNCA é
 * literal. `duracao_min` vem da RPC (de `gps.sessao_tipos`), e
 * `formatarDuracao` só o escreve. Trocar o bloco no catálogo muda esta tela
 * sem deploy (§5.4).
 *
 * 🔴 CONFIRMAÇÃO NOMEADA, com a consequência escrita. Agendar TRANCA um
 * horário da equipe e cria uma sessão viva que bloqueia outra do mesmo tipo —
 * e o aluno só cancela até 24h antes. `window.confirm` não existe neste repo
 * (removido no war-room de 10/09); o padrão é `DialogoConfirmacao`.
 */
export function GradeHorarios({
  tipo,
  horarios,
  clienteNome,
  nomeDaResponsavel,
}: {
  tipo: SessaoTipo;
  horarios: HorarioLivre[];
  /** Nome do cliente favoritado — é sobre ele que a sessão acontece. */
  clienteNome: string;
  /**
   * Sobreposição opcional do nome da profissional, por `responsavel_id`.
   *
   * ✅ PRD §9 D5 ("a tela mostra o nome") está CUMPRIDO sem esta prop: o nome
   * chega em `HorarioLivre.responsavel_nome`, 2ª coluna de
   * `gps.sessao_horarios_livres`. Medido em 22/09: devolve "Cristiane" e
   * "Elaine Montenegro".
   *
   * 🔴 Por que o nome vem do banco e não de um join aqui: o aluno **não lê**
   * `public.perfis` — a policy `gps_block_aluno` é
   * `using (gps.aluno_atual() is null)`, então todo aluno COM ambiente é
   * bloqueado; e `auth.users` não é legível por `authenticated`. Só uma RPC
   * `SECURITY DEFINER` alcança, e é de lá que o campo vem.
   *
   * Esta prop fica para quem já tenha o mapa em mãos (a tela da equipe, que
   * lista sessões de várias doutoras) e queira evitar depender da linha.
   */
  nomeDaResponsavel?: Record<string, string>;
}) {
  const router = useRouter();
  const [escolhido, setEscolhido] = useState<HorarioLivre | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, iniciar] = useTransition();
  const [diasVisiveis, setDiasVisiveis] = useState(DIAS_POR_VEZ);
  // 🔴 "Ver mais dias" desmonta no último clique: sem isto o foco cai no
  // `body` e quem navega por teclado/leitor de tela perde o lugar. O foco vai
  // para o 1º horário do 1º dia que acabou de aparecer.
  const focarDia = useRef<string | null>(null);
  const gradeRef = useRef<HTMLDivElement>(null);

  const dias = agruparPorDia(horarios);

  // O nome vem NA PRÓPRIA LINHA do horário (`responsavel_nome`, 2ª coluna da
  // RPC). O mapa por prop continua aceito como sobreposição, mas não é mais a
  // fonte primária.
  // ⚠️ `responsavel_nome` é NULLABLE de propósito: a RPC usa `left join` em
  // `public.perfis` para que uma doutora sem ficha cadastrada não SUMA com um
  // horário real da grade. O fallback abaixo existe para esse caso — não
  // removê-lo.
  function nomeDe(h: HorarioLivre): string {
    return (
      nomeDaResponsavel?.[h.responsavel_id] ??
      h.responsavel_nome ??
      "equipe jurídica"
    );
  }

  // Duração e responsável saem do botão quando são os MESMOS na grade
  // inteira: repetir "40 min · Marco" em 300 botões é ruído. A duração vem de
  // `duracao_min` de cada horário (a mesma fonte do diálogo), nunca de literal.
  const nomes = new Set(horarios.map(nomeDe));
  const duracoes = new Set(horarios.map((h) => h.duracao_min));
  const nomeUnico = nomes.size === 1 ? [...nomes][0] : null;
  const duracaoUnica =
    duracoes.size === 1 ? formatarDuracao([...duracoes][0]) : "";
  const cabecalhoCru = [
    duracaoUnica ? `Cada horário dura ${duracaoUnica}` : "",
    nomeUnico ? `com ${nomeUnico}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const cabecalho =
    cabecalhoCru.charAt(0).toUpperCase() + cabecalhoCru.slice(1);

  const diasNaTela = dias.slice(0, diasVisiveis);
  const restantes = dias.length - diasNaTela.length;

  useEffect(() => {
    const dia = focarDia.current;
    if (!dia) return;
    focarDia.current = null;
    gradeRef.current
      ?.querySelector<HTMLButtonElement>(`[data-dia="${dia}"] button`)
      ?.focus();
  }, [diasVisiveis]);

  function confirmar() {
    if (!escolhido) return;
    setErro(null);
    iniciar(async () => {
      const r = await agendarSessao({
        tipoId: tipo.id,
        responsavelId: escolhido.responsavel_id,
        data: escolhido.data,
        horaInicio: escolhido.hora_inicio,
      });
      if (!r.ok) {
        // 🔴 A frase é a que VEIO DA RPC (ela já escreve em português e
        // distingue as três travas). Não se reescreve aqui: "alguém pegou o
        // horário" e "você já tem uma marcada" pedem ações opostas do aluno.
        setErro(r.erro);
        // A grade pode ter mudado por baixo (outro aluno pegou o horário):
        // repinta para o aluno não tentar de novo no mesmo bloco morto.
        router.refresh();
        return;
      }
      setEscolhido(null);
      // 🔴 `revalidatePath` na action NÃO repinta este componente: ele é
      // Client Component e recebeu `horarios` por PROP. Sem `router.refresh()`
      // o horário recém-tomado continuaria listado como livre e o próximo
      // clique bateria na trava que este acabou de criar.
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      {cabecalho ? (
        <p className="corpo text-muted-foreground">{cabecalho}</p>
      ) : null}

      <div ref={gradeRef}>
        {diasNaTela.map((dia) => {
          // "terça-feira, 06/10/2026" → duas linhas curtas. Sem vírgula (data
          // não reconhecível), o rótulo vai inteiro, como `rotuloDoDia` deu.
          const virgula = dia.rotulo.indexOf(", ");
          const semana = virgula >= 0 ? dia.rotulo.slice(0, virgula) : null;
          const data =
            virgula >= 0 ? dia.rotulo.slice(virgula + 2) : dia.rotulo;
          return (
            <div
              key={dia.data}
              data-dia={dia.data}
              className="flex flex-col gap-2 border-b border-borda-fina py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4"
            >
              {/* O dia: posição e peso de rótulo, não de título de seção. A
                  data fica com o ano: a janela de ~2 meses pode virar o ano. */}
              <p className="corpo shrink-0 text-foreground sm:w-32 sm:pt-2.5">
                {semana ? (
                  <>
                    <span className="block font-medium">{semana}</span>
                    <span className="block corpo-sm text-muted-foreground">
                      {data}
                    </span>
                  </>
                ) : (
                  <span className="font-medium">{data}</span>
                )}
              </p>
              <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
                {dia.horarios.map((h) => {
                  const inicio = horaDeTime(h.hora_inicio);
                  const nome = nomeDe(h);
                  return (
                    <li key={`${h.data}-${h.hora_inicio}-${h.responsavel_id}`}>
                      <Button
                        variant="outline"
                        className="h-11 min-w-[5.5rem] px-4 text-base"
                        aria-label={`Escolher ${inicio}, ${dia.rotulo.replace(", ", " ")}, com ${nome}`}
                        onClick={() => {
                          setErro(null);
                          setEscolhido(h);
                        }}
                      >
                        {inicio}
                        {nomeUnico ? null : (
                          <span className="corpo-sm text-muted-foreground">
                            · {nome}
                          </span>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      {restantes > 0 ? (
        <div>
          <Button
            variant="outline"
            className="h-11 px-4 text-base"
            onClick={() => {
              focarDia.current = dias[diasVisiveis]?.data ?? null;
              setDiasVisiveis((n) => n + DIAS_POR_VEZ);
            }}
          >
            Ver mais dias ({restantes} {restantes === 1 ? "restante" : "restantes"})
          </Button>
        </div>
      ) : null}

      <DialogoConfirmacao
        aberto={escolhido !== null}
        titulo={`Marcar ${tipo.nome}`}
        descricao={
          escolhido
            ? `${
                agruparPorDia([escolhido])[0]?.rotulo ?? escolhido.data
              }, às ${horaDeTime(escolhido.hora_inicio)}`
            : undefined
        }
        /* 🔴 A CONSEQUÊNCIA, escrita — é a razão do diálogo existir.
           Três coisas que o aluno só descobriria depois:
           (1) reserva o bloco INTEIRO (2h30, não 2h — os 30 min de conversa
               sobre o cliente são a primeira parte do MESMO compromisso, §5.4);
           (2) é sobre o cliente favoritado, nomeado;
           (3) o cancelamento tem prazo de 24h.
           A duração sai de `duracao_min`; não há "2h30" escrito em código. */
        consequencia={
          escolhido ? (
            <>
              Você reserva o bloco inteiro de{" "}
              <strong>{formatarDuracao(escolhido.duracao_min)}</strong> (
              {horaDeTime(escolhido.hora_inicio)} –{" "}
              {horaFimDeBloco(escolhido.hora_inicio, escolhido.duracao_min)}) —
              a primeira parte é sobre o cliente, e a sessão segue na sequência,
              sem intervalo. A sessão é sobre <strong>{clienteNome}</strong>.
              Depois de marcada, você só cancela até 24 horas antes do início.
            </>
          ) : null
        }
        rotuloConfirmar={`Marcar ${tipo.nome}`}
        rotuloConfirmando="Marcando…"
        rotuloCancelar="Voltar"
        // Não é destrutivo: agendar não apaga nada. O vermelho é do que some.
        destrutivo={false}
        confirmando={confirmando}
        erro={erro}
        onConfirmar={confirmar}
        onCancelar={() => {
          setEscolhido(null);
          setErro(null);
        }}
      />

      {/* O erro também fora do diálogo: quando a action falha, o diálogo
          continua aberto e mostra a frase — mas se o aluno fechar, ela não
          pode sumir sem explicação. `role="alert"` porque é resultado de uma
          ação dele (regra do projeto para erro de formulário). */}
      {erro && escolhido === null ? (
        <p role="alert" className="corpo-sm text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
