import { Star, Phone, Users2, PhoneCall, CalendarClock, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Secao } from "@/components/ui/secao";
import { CopiarContato } from "@/components/admin/copiar-contato";
import { mascaraTelefone } from "@/lib/masks";
import { formatarDataHora } from "@/lib/datas";
import { FASES_CLIENTE, PERFIS_DISC } from "@/lib/etapa1";
import type { DossieDoCliente } from "@/lib/operador-tipos";
import type { ResultadoEntrevista } from "@/lib/entrevista-tipos";

// Catálogo FECHADO — `Record<ResultadoEntrevista, string>`, não
// `Record<string, string>`: se `RESULTADOS_ENTREVISTA` (entrevista-tipos.ts)
// ganhar um valor novo, o TS acusa aqui em vez de a tela mostrar o código cru
// em silêncio. Lição do repo: "catálogo do TS não acompanha CHECK do banco
// sozinho — pôr o valor na união É a trava".
const ROTULO_RESULTADO: Record<ResultadoEntrevista, string> = {
  interessado: "Interessado",
  sem_interesse: "Sem interesse",
  nao_atendeu: "Não atendeu",
  remarcar: "Remarcar",
};

const ROTULO_ESTADO_PROPOSTA: Record<string, string> = {
  proposta: "Aguardando resposta",
  aceita: "Aceita",
  contestada: "Contestada",
  cancelada: "Cancelada",
};

/** `ROTULO_RESULTADO` indexado com segurança — o valor vem do banco (`string`
 * solto no shape do dossiê), então confere antes de indexar em vez de um
 * cast cego; fora do catálogo (não deveria acontecer, CHECK garante) cai no
 * valor cru em vez de quebrar a tela. */
function rotuloResultado(resultado: string): string {
  return resultado in ROTULO_RESULTADO
    ? ROTULO_RESULTADO[resultado as ResultadoEntrevista]
    : resultado;
}

/**
 * O dossiê de UM cliente — nome, telefone, grau de relação, fase, DISC,
 * decisores, resultado + observações + quem + quando da entrevista, data da
 * reunião preliminar e nome do parceiro. É o que o advogado lê antes de
 * entrar na reunião / o que o operador lê antes de ligar.
 *
 * UI DENSA e CHAPADA: hierarquia por POSIÇÃO (seções em sequência, rótulo à
 * esquerda / valor à direita), sem card decorativo por dado, sem ícone
 * grande — mesmo padrão de `FilaDeLigacoes`.
 *
 * 🔴 LGPD: só renderiza o que `dossie` (a RPC `gps.dossie_do_cliente`) traz.
 * Não busca `registro_contato`, CPF, financeiro nem o Diário do parceiro em
 * lugar nenhum — a ausência aqui é deliberada, não lacuna a preencher.
 */
export function Dossie({ dossie }: { dossie: DossieDoCliente }) {
  const fase = FASES_CLIENTE.find((f) => f.id === dossie.fase);
  const disc = dossie.perfilDisc
    ? (PERFIS_DISC.find((d) => d.id === dossie.perfilDisc)?.rotulo ?? dossie.perfilDisc)
    : null;
  const principal = dossie.decisores.find((d) => d.principal) ?? null;
  const outrosDecisores = dossie.decisores.filter((d) => d !== principal);

  return (
    <div className="grid gap-8">
      <Secao icone={<Phone aria-hidden />} titulo="Identificação" nivel="h2">
        <Card elevacao="flat">
          <CardContent className="grid gap-3">
            <LinhaDado rotulo="Telefone">
              {dossie.telefone ? (
                <CopiarContato
                  valor={dossie.telefone}
                  rotuloAcessivel={`Copiar telefone de ${dossie.clienteNome}`}
                  formatar={mascaraTelefone}
                  className="font-medium tabular-nums"
                />
              ) : (
                <span className="text-muted-foreground">Não informado</span>
              )}
            </LinhaDado>

            <LinhaDado rotulo="Grau de relação">
              {dossie.grauRelacao ?? (
                <span className="text-muted-foreground">Não informado</span>
              )}
            </LinhaDado>

            <LinhaDado rotulo="Fase">
              {fase ? (
                <span
                  className={
                    "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold " +
                    fase.cor
                  }
                  title={fase.ajuda}
                >
                  {fase.rotulo}
                </span>
              ) : (
                dossie.fase
              )}
            </LinhaDado>

            <LinhaDado rotulo="Perfil DISC">
              {disc ?? <span className="text-muted-foreground">Não informado</span>}
            </LinhaDado>

            <LinhaDado rotulo="Cliente acompanhado pela equipe">
              {dossie.acompanhadoEquipe ? (
                <span className="inline-flex items-center gap-1 font-medium text-atencao-foreground">
                  <Star aria-hidden className="size-3.5 fill-atencao-foreground" />
                  Sim
                </span>
              ) : (
                "Não"
              )}
            </LinhaDado>
          </CardContent>
        </Card>
      </Secao>

      <Secao icone={<PhoneCall aria-hidden />} titulo="Entrevista prévia" nivel="h2">
        {!dossie.selecionadoEntrevista && !dossie.entrevista.resultado ? (
          <p className="corpo-sm text-muted-foreground">
            Este cliente ainda não foi selecionado para a entrevista prévia.
          </p>
        ) : (
          <Card elevacao="flat">
            <CardContent className="grid gap-3">
              <LinhaDado rotulo="Resultado da última ligação">
                {dossie.entrevista.resultado ? (
                  rotuloResultado(dossie.entrevista.resultado)
                ) : (
                  <span className="text-muted-foreground">
                    Ainda não ligaram para este cliente.
                  </span>
                )}
              </LinhaDado>

              {dossie.entrevista.em ? (
                <LinhaDado rotulo="Registrado em">
                  {formatarDataHora(dossie.entrevista.em)}
                </LinhaDado>
              ) : null}

              {dossie.entrevista.observacoes ? (
                <div className="grid gap-1 border-t border-borda-fina pt-3">
                  <span className="corpo-sm font-medium text-foreground">
                    Observações
                  </span>
                  <p className="corpo-sm whitespace-pre-wrap text-muted-foreground">
                    {dossie.entrevista.observacoes}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      </Secao>

      <Secao icone={<History aria-hidden />} titulo="Histórico de ligações" nivel="h2">
        {dossie.tentativas.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">
            Nenhuma tentativa de ligação registrada ainda.
          </p>
        ) : (
          <Card elevacao="flat" className="[--card-spacing:--spacing(0)]">
            <CardContent className="p-0">
              <ul className="divide-y" aria-label="Histórico de ligações">
                {dossie.tentativas.map((t) => (
                  <li key={t.id} className="grid gap-1 px-4 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <span className="corpo-sm font-medium text-foreground">
                        {formatarDataHora(t.tentativaEm)}
                      </span>
                      <span className="corpo-sm text-muted-foreground">
                        {rotuloResultado(t.resultado)}
                        {t.qualidade ? ` · nota ${t.qualidade}/5` : ""}
                      </span>
                    </div>
                    {t.retornoEm ? (
                      <span className="corpo-sm text-muted-foreground">
                        Retorno pedido para {formatarDataHora(t.retornoEm)}
                      </span>
                    ) : null}
                    {t.observacoes ? (
                      <p className="corpo-sm whitespace-pre-wrap text-muted-foreground">
                        {t.observacoes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </Secao>

      <Secao icone={<Users2 aria-hidden />} titulo="Decisores do negócio" nivel="h2">
        {dossie.decisores.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">
            Nenhum decisor registrado ainda.
          </p>
        ) : (
          <Card elevacao="flat" className="[--card-spacing:--spacing(0)]">
            <CardContent className="p-0">
              <ul className="divide-y" aria-label="Decisores do negócio">
                {[...(principal ? [principal] : []), ...outrosDecisores].map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {d.principal ? (
                        <Star
                          aria-label="Decisor principal"
                          className="size-3.5 shrink-0 fill-atencao-foreground text-atencao-foreground"
                        />
                      ) : null}
                      <span className="truncate font-medium text-foreground">
                        {d.nome}
                      </span>
                    </span>
                    <span className="shrink-0 corpo-sm text-muted-foreground">
                      {d.papelNoNegocio ?? "Papel não informado"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </Secao>

      <Secao icone={<CalendarClock aria-hidden />} titulo="Reunião preliminar" nivel="h2">
        <Card elevacao="flat">
          <CardContent className="grid gap-3">
            <LinhaDado rotulo="Data aceita">
              {dossie.reuniao.dataAceita ? (
                formatarDataHora(dossie.reuniao.dataAceita)
              ) : (
                <span className="text-muted-foreground">Ainda sem data aceita.</span>
              )}
            </LinhaDado>

            <LinhaDado rotulo="Aderiu">{dossie.reuniao.aderiu ? "Sim" : "Não"}</LinhaDado>

            {dossie.reuniao.propostaVivaData ? (
              <LinhaDado rotulo="Proposta aguardando resposta">
                {formatarDataHora(dossie.reuniao.propostaVivaData)}
              </LinhaDado>
            ) : null}

            {dossie.reuniao.propostas.length > 0 ? (
              <div className="grid gap-2 border-t border-borda-fina pt-3">
                <span className="corpo-sm font-medium text-foreground">
                  Histórico de propostas
                </span>
                <ul className="grid gap-1.5">
                  {dossie.reuniao.propostas.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 corpo-sm"
                    >
                      <span className="text-foreground">
                        {formatarDataHora(p.dataProposta)}
                      </span>
                      <span className="text-muted-foreground">
                        {ROTULO_ESTADO_PROPOSTA[p.estado] ?? p.estado}
                        {p.contestacaoMotivo ? ` — ${p.contestacaoMotivo}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </Secao>
    </div>
  );
}

/** Uma linha rótulo/valor, hierarquia por posição — sem card por dado. */
function LinhaDado({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <span className="corpo-sm text-muted-foreground">{rotulo}</span>
      <span className="corpo-sm text-right text-foreground">{children}</span>
    </div>
  );
}
