"use client";

// 🔑 Reusa `PERFIS_DISC` de `etapa1.ts` — a MESMA lista que a ficha do
// cliente usa. Uma segunda lista escrita à mão divergiria no primeiro dia em
// que alguém mexesse só numa delas.
import { PERFIS_DISC } from "@/lib/etapa1";

// Espelha o CHECK da tabela (3..2000 nos três campos ricos). O piso de 3 é
// cobrado pela RPC, com frase em português.
const DISC_RICO_MAXIMO = 2000;

/**
 * O DISC do cliente, oferecido AO CONCLUIR a Entrevista Prévia.
 *
 * 🔑 POR QUE AQUI, e não só na ficha do cliente: a doutora acabou de conversar
 * com a pessoa — é o instante em que ela sabe a resposta. Até 22/09,
 * `sessao_concluir` não tocava no DISC: ela concluía, o perfil continuava
 * vazio, e alguém tinha de lembrar de preencher na ficha depois. Medido
 * naquele dia: 28 de 35 clientes favoritados estavam sem DISC nenhum.
 *
 * Decisão do Marcio: *"a Entrevista Prévia gera o perfil DISC"*.
 *
 * 🔴 TUDO OPCIONAL, e campo em branco PRESERVA o que existe — a RPC usa
 * `coalesce(novo, antigo)`. Concluir sem preencher nada nunca apaga a
 * anotação de outra pessoa. Por isso os campos nascem com o valor atual: a
 * doutora vê o que já está lá antes de decidir mudar.
 *
 * 🔴 NÃO aparece na Reunião Preliminar: lá o DISC já deveria existir, e pedir
 * de novo convidaria a sobrescrever o que a Entrevista capturou.
 */
export function DiscNaConclusao({
  letra,
  consciencia,
  gatilhos,
  relacionamento,
  aoMudar,
  desabilitado,
}: {
  letra: string;
  consciencia: string;
  gatilhos: string;
  relacionamento: string;
  aoMudar: (campo: "letra" | "consciencia" | "gatilhos" | "relacionamento", valor: string) => void;
  desabilitado: boolean;
}) {
  const campoClasse =
    "w-full rounded-md border border-borda-forte bg-card px-2 py-1.5 corpo-sm " +
    "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 " +
    "focus-visible:outline-ring";

  return (
    <div className="grid gap-3 border-t border-borda-fina pt-3">
      <div>
        <p className="rotulo text-muted-foreground">Perfil DISC do cliente</p>
        <p className="corpo-sm text-muted-foreground">
          Você acabou de conversar com ele. Preencher agora evita ter que
          lembrar depois — o que ficar em branco continua como está.
        </p>
      </div>

      <fieldset className="grid gap-1" disabled={desabilitado}>
        <legend className="rotulo text-muted-foreground">Letra</legend>
        <div className="flex flex-wrap gap-2">
          {PERFIS_DISC.map((l) => {
            const ativa = letra === l.id;
            return (
              <button
                key={l.id}
                type="button"
                // `min-h-11`: alvo tocável no celular (WCAG 2.5.8). A suíte
                // E2E reprova abaixo de 24px, e esta tela é usada em telefone.
                className={
                  "foco-visivel inline-flex min-h-11 items-center rounded-md border px-3 corpo-sm " +
                  (ativa
                    ? "border-marca-acao bg-marca-acao/10 font-medium text-accent-foreground"
                    : "border-borda-forte hover:border-borda-forte")
                }
                // A cor não é o único sinal (WCAG 1.4.1): o estado também vai
                // em `aria-pressed` e no peso da fonte.
                aria-pressed={ativa}
                onClick={() => aoMudar("letra", ativa ? "" : l.id)}
              >
                <span>{l.rotulo}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {(
        [
          ["consciencia", "Consciência", consciencia,
           "O quanto ele já entende o problema que tem."],
          ["gatilhos", "Gatilhos emocionais", gatilhos,
           "O que mobiliza essa pessoa — o que faz ela agir."],
          ["relacionamento", "Relacionamento", relacionamento,
           "Como conduzir a relação com ela daqui para frente."],
        ] as const
      ).map(([campo, rotulo, valor, ajuda]) => (
        <label key={campo} className="grid gap-1">
          <span className="rotulo text-muted-foreground">
            {rotulo} — {ajuda}
          </span>
          <textarea
            value={valor}
            onChange={(e) => aoMudar(campo, e.target.value)}
            maxLength={DISC_RICO_MAXIMO}
            rows={2}
            disabled={desabilitado}
            className={campoClasse}
          />
        </label>
      ))}
    </div>
  );
}
