"use client";

/**
 * Tirar a estrela (cliente acompanhado pela equipe) de VÁRIOS parceiros de
 * uma vez (02/10/2026).
 *
 * Molde: `lote-etapas.tsx` — mesma barra, mesma seleção, mesmo teto escrito.
 * O que muda:
 *
 * 1. **Prévia antes de gravar.** O diálogo chama `removerFavoritoEmLote` com
 *    `simular: true`; só depois da prévia o botão vira "Tirar estrela de N".
 *    Marcar/desmarcar "Forçar" invalida a prévia (muda quem é pulado).
 * 2. **O resultado é por pessoa**, ao contrário do lote de etapas: quem foi
 *    pulado aparece pelo NOME, com os motivos do servidor. O nome vem da lista
 *    em memória (snapshot dos selecionados) — nada é buscado de novo.
 * 3. **A seleção NÃO é limpa no sucesso.** Limpar desabilita o gatilho, e o
 *    `Dialog` do Base UI devolve o foco ao gatilho: botão desabilitado perde o
 *    foco para o `body`. Reenviar a mesma seleção é inofensivo (vira "sem
 *    favorito").
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StarOff } from "lucide-react";
import { toast } from "sonner";

import { removerFavoritoEmLote } from "@/app/admin/central-actions";
// ⚠️ Constantes em módulo `-tipos`, nunca no `central-actions.ts`: arquivo
// `"use server"` só exporta função async.
import {
  FAVORITO_LOTE_MAXIMO,
  type ResultadoFavoritoLote,
} from "@/lib/favorito-lote-tipos";
// Fonte única do motivo 3..300 da trilha do aluno.
import { MOTIVO_MAX, MOTIVO_MIN } from "@/lib/etapas-lote-tipos";
import type { AlunoGps } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type PessoaDoLote = Pick<AlunoGps, "alunoId" | "aluno">;

const nomeDe = (a: PessoaDoLote) =>
  a.aluno?.nome ?? a.aluno?.email ?? "Parceiro sem nome";

const plural = (n: number, um: string, varios: string) =>
  `${n} ${n === 1 ? um : varios}`;

const CONSEQUENCIA =
  "A sessão, a Entrevista Prévia, o contrato e a proposta continuam ligados ao cliente antigo; as telas que leem pelo favorito deixam de mostrá-los. O aluno escolhe a nova estrela na aba Clientes.";

/**
 * "M deles com caso andando": removidos que vieram COM motivo. Na RPC
 * (`…000331_gps_admin_remover_favorito_lote.sql`, linhas 212-217), item com
 * `motivos` não vazio só sai `removido` quando `p_forcar = true`. Mudou lá,
 * muda aqui.
 */
function comCasoAndando(r: ResultadoFavoritoLote) {
  return r.itens.filter((i) => i.resultado === "removido" && i.motivos.length > 0)
    .length;
}

function fraseContagem(
  r: ResultadoFavoritoLote,
  forcar: boolean,
  tempo: "previa" | "real",
) {
  const removidos =
    tempo === "previa"
      ? plural(r.removidos, "perde a estrela", "perdem a estrela")
      : plural(r.removidos, "perdeu a estrela", "perderam a estrela");
  const andando = forcar && r.removidos > 0 ? comCasoAndando(r) : 0;
  const comAndando =
    forcar && r.removidos > 0
      ? `${removidos}, ${andando} ${andando === 1 ? "dele" : "deles"} com caso andando`
      : removidos;
  return `${comAndando} · ${r.semFavorito} sem favorito · ${plural(r.pulados, "pulado", "pulados")}.`;
}

function ListaPulados({
  resultado,
  nomes,
}: {
  resultado: ResultadoFavoritoLote;
  nomes: Map<string, string>;
}) {
  const pulados = resultado.itens.filter((i) => i.resultado === "pulado");
  if (pulados.length === 0) return null;
  return (
    <ul className="grid max-h-40 gap-0.5 overflow-y-auto corpo-sm">
      {pulados.map((i) => (
        <li key={i.alunoId}>
          <span className="font-medium">
            {nomes.get(i.alunoId) ?? "Parceiro fora da lista"}
          </span>
          <span className="text-muted-foreground">
            {" "}
            — {i.motivos.length > 0 ? i.motivos.join("; ") : "sem motivo informado"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LoteDeFavorito({
  selecionados,
}: {
  /** Os marcados, na ordem da lista (já é a interseção com o que está na tela). */
  selecionados: PessoaDoLote[];
}) {
  const router = useRouter();
  const idMotivo = useId();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [forcar, setForcar] = useState(false);
  const [tentouEnviar, setTentouEnviar] = useState(false);
  const [previa, setPrevia] = useState<ResultadoFavoritoLote | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(() => new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [final, setFinal] = useState<{
    resultado: ResultadoFavoritoLote;
    forcar: boolean;
  } | null>(null);
  const [enviando, startTransition] = useTransition();

  const qtd = selecionados.length;
  const acimaDoTeto = qtd > FAVORITO_LOTE_MAXIMO;
  const tamMotivo = motivo.trim().length;
  const motivoOk = tamMotivo >= MOTIVO_MIN && tamMotivo <= MOTIVO_MAX;
  const motivoInvalido = (tentouEnviar || motivo.length > 0) && !motivoOk;

  function abrir() {
    setErro(null);
    setPrevia(null);
    setTentouEnviar(false);
    setAberto(true);
  }

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setErro(null);
    setPrevia(null);
  }

  function chamar(simular: boolean) {
    setTentouEnviar(true);
    if (!motivoOk) return;
    setErro(null);
    const ids = selecionados.map((a) => a.alunoId);
    const mapa = new Map(selecionados.map((a) => [a.alunoId, nomeDe(a)]));
    const entrada = { alunoIds: ids, motivo: motivo.trim(), simular, forcar };
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof removerFavoritoEmLote>>;
      try {
        r = await removerFavoritoEmLote(entrada);
      } catch {
        setErro(
          "Sem resposta do servidor. Recarregue a lista e confira antes de tentar de novo.",
        );
        return;
      }
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setNomes(mapa);
      if (simular) {
        setPrevia(r.resultado);
        return;
      }
      setAberto(false);
      setPrevia(null);
      setMotivo("");
      setTentouEnviar(false);
      setFinal({ resultado: r.resultado, forcar: entrada.forcar });
      toast.success(fraseContagem(r.resultado, entrada.forcar, "real"));
      // Sem isto os cards continuam mostrando a estrela antiga até alguém
      // recarregar à mão (revalidatePath não repinta Client Component).
      router.refresh();
    });
  }

  const nadaATirar = previa !== null && previa.removidos === 0;

  return (
    <div className="grid gap-2 rounded-xl bg-superficie-afundada px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={qtd === 0 || acimaDoTeto || enviando}
          onClick={abrir}
        >
          <StarOff aria-hidden />
          Tirar estrela dos selecionados
        </Button>
        {acimaDoTeto ? (
          <p className="corpo-sm text-atencao-foreground">
            Selecione no máximo {FAVORITO_LOTE_MAXIMO} por vez para tirar a
            estrela.
          </p>
        ) : null}
      </div>

      {/* Sempre montado: região viva que nasce junto com o texto não é
          anunciada por todo leitor de tela. */}
      <p aria-live="polite" className="corpo-sm">
        {final ? fraseContagem(final.resultado, final.forcar, "real") : null}
      </p>
      {final ? <ListaPulados resultado={final.resultado} nomes={nomes} /> : null}

      <DialogoConfirmacao
        aberto={aberto}
        titulo={`Tirar a estrela de ${plural(qtd, "parceiro", "parceiros")}?`}
        descricao={
          <span className="line-clamp-3">
            {selecionados.map(nomeDe).join(", ")}
          </span>
        }
        consequencia="Nada é gravado até você ver a prévia e confirmar."
        rotuloConfirmar={
          previa === null
            ? "Ver prévia"
            : nadaATirar
              ? "Fechar"
              : `Tirar estrela de ${plural(previa.removidos, "parceiro", "parceiros")}`
        }
        rotuloConfirmando={previa === null ? "Calculando…" : "Tirando…"}
        destrutivo={previa !== null && !nadaATirar}
        confirmando={enviando}
        erro={null}
        onConfirmar={() => {
          if (previa === null) chamar(true);
          else if (nadaATirar) fechar();
          else chamar(false);
        }}
        onCancelar={fechar}
      >
        <div className="grid gap-1">
          <Label htmlFor={idMotivo}>Motivo (fica no histórico de cada parceiro)</Label>
          <Textarea
            id={idMotivo}
            value={motivo}
            rows={2}
            maxLength={MOTIVO_MAX}
            disabled={enviando}
            aria-describedby={`${idMotivo}-ajuda`}
            aria-invalid={motivoInvalido || undefined}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <p
            id={`${idMotivo}-ajuda`}
            className={
              motivoInvalido
                ? "corpo-sm text-destructive"
                : "corpo-sm text-muted-foreground"
            }
          >
            Obrigatório, de {MOTIVO_MIN} a {MOTIVO_MAX} caracteres ({tamMotivo}/
            {MOTIVO_MAX}).
          </p>
        </div>

        <label className="flex items-start gap-2 corpo-sm">
          <Checkbox
            className="mt-0.5"
            checked={forcar}
            disabled={enviando}
            onCheckedChange={(v) => {
              setForcar(v === true);
              // Forçar muda quem é pulado: a prévia antiga deixa de valer.
              setPrevia(null);
            }}
          />
          <span>Forçar também em quem já tem o caso andando</span>
        </label>

        {previa ? (
          <div className="grid gap-1 border-t pt-2">
            <p className="corpo-sm font-medium">
              {fraseContagem(previa, forcar, "previa")}
            </p>
            <ListaPulados resultado={previa} nomes={nomes} />
            <p className="corpo-sm">{CONSEQUENCIA}</p>
          </div>
        ) : null}

        {/* Sempre montado (região viva). */}
        <p role="alert" className="corpo-sm text-destructive empty:hidden">
          {erro}
        </p>
      </DialogoConfirmacao>
    </div>
  );
}
