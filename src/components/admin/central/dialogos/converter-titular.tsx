"use client";

/**
 * Converter um TITULAR de ambiente próprio em SÓCIO deste ambiente — o
 * diálogo, com a prévia do servidor e a confirmação nomeada.
 *
 * POR QUE ESTE DIÁLOGO NÃO É UM `ConfirmacaoDaAcao` A MAIS
 *   As dez confirmações de `confirmacoes.tsx` são copy pura: o alvo já está
 *   na mão quando o diálogo abre, e o texto só descreve o que vai acontecer.
 *   Esta ação **busca dado ao abrir** (a prévia: quantos clientes copiam,
 *   quantos já existem no destino, quanto fica para trás) e tem **campo de
 *   confirmação nomeada**. Misturá-la lá dentro faria o arquivo de textos
 *   ganhar estado, `useEffect` e rede — e a união discriminada de `tipos.ts`
 *   deixaria de ser "um tipo, uma frase".
 *
 * 🔴 TRÊS COISAS TÊM DE ESTAR ESCRITAS AQUI, e estão:
 *   1. **o que VAI** — N clientes copiados, M já existem no destino e não são
 *      duplicados (números do SERVIDOR, nunca contados no navegador);
 *   2. **o que FICA** — progresso, notas e chamados não vão junto;
 *   3. **a cópia não se desfaz sozinha** — o retrato na lixeira devolve o
 *      ambiente antigo, mas as linhas copiadas no destino nascem com id novo.
 *      Desfazer a conversão NÃO as apaga.
 *
 * 🔑 Regra do projeto: **nunca deixar clicar e falhar**. O botão desabilita e
 * a razão aparece **escrita ao lado**, em texto que a pessoa lê — o molde é
 * `razaoParaTravar` (`src/components/socio-cadastro/travas.ts`). Aqui a razão
 * vem em duas camadas: o `impedimento` da prévia (as guardas da RPC, vindas
 * do banco) e a confirmação nomeada que ainda não bate.
 *
 * ⚠️ A prévia é **retrato, não promessa**: entre abrir e confirmar, alguém
 * pode cadastrar um cliente. O número que vale é o que a escrita DEVOLVE, e é
 * ele que sai no toast de sucesso — por isso a action retorna
 * `clientesCopiados`/`clientesJaExistiam` e a tela não repete o da prévia.
 */

import { useEffect, useId, useState, useTransition } from "react";
import {
  previaConversaoSocio,
  type converterTitularEmSocio,
} from "@/app/admin/central-actions";
import type { PreviaConversaoSocio } from "@/lib/data/conversao-socio";
import type { AlunoBusca } from "@/app/admin/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A ação que este diálogo executa — a assinatura vem da própria action. */
type Converter = typeof converterTitularEmSocio;

/**
 * Linha do quadro "o que vai / o que fica". Densa e chapada: rótulo à
 * esquerda, número à direita, borda fina embaixo. Sem card, sem ícone, sem
 * fonte grande — a hierarquia é a POSIÇÃO (o que VAI vem primeiro).
 */
function Linha({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-borda-fina py-1.5 last:border-b-0">
      <span className="min-w-0 corpo-sm">
        {rotulo}
        {detalhe ? (
          <span className="text-muted-foreground"> — {detalhe}</span>
        ) : null}
      </span>
      <span className="shrink-0 corpo font-medium tabular-nums">{valor}</span>
    </div>
  );
}

export function ConverterTitularEmSocio({
  /** O ambiente que RECEBE a pessoa como sócia (onde o admin está). */
  ambienteDestinoId,
  nomeDestino,
  /**
   * O cadastro escolhido no seletor — o titular que vai virar sócio.
   *
   * 🔑 `escolhido.id` é `public.thb_alunos.id` e é o ÚNICO id que sai desta
   * tela para o banco, tanto na prévia quanto na confirmação. As duas RPCs
   * resolvem o membro a partir do cadastro; não existe caminho em que a tela
   * precise conhecer `gps.membros.id` (ela não conhece os membros de outro
   * ambiente, e não precisa).
   */
  escolhido,
  converter,
  onConcluido,
  onCancelar,
}: {
  ambienteDestinoId: string;
  nomeDestino: string | null;
  escolhido: AlunoBusca;
  converter: Converter;
  onConcluido: (mensagem: string) => void;
  onCancelar: () => void;
}) {
  const idConfirmar = useId();
  const idAjuda = `${idConfirmar}-ajuda`;

  const [previa, setPrevia] = useState<PreviaConversaoSocio | null>(null);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [confirmacao, setConfirmacao] = useState("");
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [pendente, executando] = useTransition();

  // A prévia é buscada UMA vez, na montagem. `escolhido.id` é o cadastro, e o
  // diálogo é remontado (`key={converter.id}` no `index.tsx`) quando ele muda
  // — não há caminho para este efeito rodar duas vezes pelo mesmo alvo.
  //
  // ⚠️ Sem `setCarregando(true)` aqui de propósito: o estado já NASCE `true` e
  // a remontagem por `key` o devolve a `true` sozinha. Chamar setState
  // síncrono no corpo do efeito dispara render em cascata (o `eslint` deste
  // repo recusa: `react-hooks/set-state-in-effect`). Se um dia este diálogo
  // deixar de ser remontado por `key`, é ESTE comentário que precisa mudar
  // junto — senão a segunda busca pintaria os números do alvo anterior
  // enquanto a nova não volta.
  useEffect(() => {
    let vivo = true;
    previaConversaoSocio(escolhido.id, ambienteDestinoId)
      .then((r) => {
        if (!vivo) return;
        if (r.erro || !r.previa) {
          setErroPrevia(
            r.erro ??
              "Não foi possível conferir o que seria copiado. Nada foi alterado.",
          );
        } else {
          setPrevia(r.previa);
        }
      })
      .catch(() => {
        // A frase é nossa, nunca `error.message` — em produção ele pode
        // carregar detalhe interno. Mesmo contrato do `SeletorCadastro`.
        if (vivo) {
          setErroPrevia("A conferência não respondeu agora. Tente de novo.");
        }
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [escolhido.id, ambienteDestinoId]);

  const nomeOrigem = previa?.origem.nome ?? escolhido.nome ?? null;
  const digitado = confirmacao.trim();
  const nomeBate =
    nomeOrigem !== null &&
    digitado.localeCompare(nomeOrigem.trim(), "pt-BR", {
      sensitivity: "accent",
    }) === 0;

  /**
   * Por que o botão está desligado, **em português**. `null` = pode converter.
   *
   * A ordem importa: primeiro o que não tem conserto na tela (carregando,
   * falhou, o banco recusa), depois o que o admin resolve digitando.
   */
  function razaoParaTravar(): string | null {
    if (carregando) return "Conferindo o que seria copiado…";
    if (erroPrevia) return erroPrevia;
    if (!previa) return "A conferência não trouxe resultado.";
    if (!previa.podeConverter) {
      return (
        previa.impedimento ??
        "Este cadastro não pode ser convertido em sócio deste ambiente."
      );
    }
    if (!nomeOrigem) {
      return "O ambiente de origem está sem nome — não há como confirmar por digitação.";
    }
    if (digitado.length === 0) {
      return `Digite ${nomeOrigem} para confirmar.`;
    }
    if (!nomeBate) {
      return "O nome digitado não é igual ao do ambiente de origem.";
    }
    return null;
  }

  const travado = razaoParaTravar();

  function confirmar() {
    if (travado || !previa) return;
    setErroAcao(null);
    executando(async () => {
      // 🔴 `escolhido.id` (o CADASTRO em `public.thb_alunos`), NUNCA
      // `previa.membroId` — que é `gps.membros.id`. As duas RPCs resolvem o
      // membro a partir do cadastro (`pessoa_aluno_id = X or (pessoa_aluno_id
      // is null and aluno_id = X)`); passar `membros.id` não casa com
      // nenhuma das duas colunas e a RPC devolve P0002 "Nenhum acesso
      // encontrado para este cadastro" — para um cadastro que TEM acesso.
      // Medido em produção em 21/09: a prévia já usava `escolhido.id` e só a
      // confirmação mandava o id errado, então o diálogo abria certo e o
      // botão falhava. É o mesmo id nos dois lados, de propósito.
      const r = await converter(
        escolhido.id,
        ambienteDestinoId,
        digitado,
        previa.origem.alunoId,
      );
      if (r.erro) {
        setErroAcao(r.erro);
        return;
      }
      // A frase de sucesso sai do RETORNO da action, nunca da prévia: entre
      // abrir o diálogo e confirmar, o conjunto pode ter mudado.
      const copiados = r.clientesCopiados ?? 0;
      const existiam = r.clientesJaExistiam ?? 0;
      const alvo = r.destinoNome ?? nomeDestino ?? "este ambiente";
      const sufixo =
        existiam > 0
          ? ` ${existiam} já ${existiam === 1 ? "existia" : "existiam"} aqui e não ${existiam === 1 ? "foi duplicado" : "foram duplicados"}.`
          : "";
      onConcluido(
        `${r.origemNome ?? nomeOrigem ?? "O parceiro"} agora é sócio de ${alvo}. ${copiados} ${copiados === 1 ? "cliente copiado" : "clientes copiados"}.${sufixo}`,
      );
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        // Enquanto a escrita roda, Esc e clique fora não fecham: fechar aqui
        // deixaria o admin sem o resultado do que acabou de mandar fazer.
        // Mesma regra do `DialogoConfirmacao`.
        if (!v && !pendente) onCancelar();
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tornar este titular sócio deste ambiente?</DialogTitle>
          <DialogDescription>
            {escolhido.nome ?? "Cadastro sem nome"}
            {previa?.origem.emailLogin ? ` · ${previa.origem.emailLogin}` : ""}
            {" → "}
            {nomeDestino ?? "este ambiente"}
          </DialogDescription>
        </DialogHeader>

        {/* O QUE VAI — primeiro, porque é a razão da ação existir. */}
        <div>
          <p className="rotulo text-muted-foreground">O que vai junto</p>
          <div className="mt-1">
            {previa ? (
              <>
                <Linha
                  rotulo="Clientes copiados para cá"
                  valor={previa.clientesACopiar}
                  detalhe={`de ${previa.clientesNaOrigem} no ambiente de origem`}
                />
                <Linha
                  rotulo="Já existem aqui"
                  valor={previa.clientesJaNoDestino}
                  detalhe="não são duplicados"
                />
              </>
            ) : (
              <p className="py-1.5 corpo-sm text-muted-foreground">
                {carregando
                  ? "Conferindo no servidor…"
                  : "Não foi possível conferir."}
              </p>
            )}
          </div>
        </div>

        {/* O QUE FICA — segundo, e com os números, não só a frase. */}
        <div>
          <p className="rotulo text-muted-foreground">
            O que fica no ambiente de origem
          </p>
          <div className="mt-1">
            {previa ? (
              <>
                <Linha
                  rotulo="Tarefas concluídas"
                  valor={previa.progressoNaOrigem}
                  detalhe="refazem-se clicando"
                />
                <Linha
                  rotulo="Notas do Diário"
                  valor={previa.notasNaOrigem}
                  detalhe="atendimento passado"
                />
                <Linha
                  rotulo="Chamados"
                  valor={previa.chamadosNaOrigem}
                  detalhe="atendimento passado"
                />
              </>
            ) : (
              <p className="py-1.5 corpo-sm text-muted-foreground">
                {carregando ? "Conferindo…" : "—"}
              </p>
            )}
          </div>
        </div>

        <p className="corpo-sm">
          O ambiente de origem deixa de existir como ambiente próprio e o acesso
          da pessoa passa para cá, como <strong>sócio</strong>. Um retrato do
          ambiente antigo é guardado na lixeira antes de qualquer mudança — é o
          caminho de volta.
        </p>

        {/* 🔴 A irreversibilidade da CÓPIA, em texto, no diálogo — não só no
            relatório. Sem esta frase o admin lê "tem retrato na lixeira" e
            conclui, errado, que desfazer limpa tudo. */}
        <p className="corpo-sm font-medium">
          A cópia dos clientes não se desfaz sozinha. Restaurar o retrato
          devolve o ambiente antigo, mas as linhas copiadas para cá ficam com
          identificador novo e permanecem aqui — apagar uma a uma seria manual.
        </p>

        {/* CONFIRMAÇÃO NOMEADA — molde do "digite EXCLUIR", com o nome do
            ambiente de origem no lugar da palavra fixa. */}
        <div className="grid gap-2">
          <Label htmlFor={idConfirmar}>
            Para confirmar, digite o nome do ambiente de origem
          </Label>
          <Input
            id={idConfirmar}
            value={confirmacao}
            onChange={(e) => setConfirmacao(e.target.value)}
            placeholder={nomeOrigem ?? "nome do ambiente de origem"}
            autoComplete="off"
            disabled={pendente || carregando || !previa?.podeConverter}
            aria-describedby={idAjuda}
            aria-invalid={
              (digitado.length > 0 && !nomeBate) || undefined
            }
          />
          <p id={idAjuda} className="corpo-sm text-muted-foreground">
            {nomeOrigem
              ? `Exatamente como está escrito: ${nomeOrigem}`
              : "O nome do ambiente de origem vem da conferência."}
          </p>
        </div>

        {/* A razão de o botão estar desligado fica AO LADO dele, escrita.
            `aria-live` para quem usa leitor de tela descobrir junto. */}
        <p aria-live="polite" className="corpo-sm text-muted-foreground empty:hidden">
          {erroAcao ? "" : (travado ?? "")}
        </p>
        <p aria-live="assertive" className="corpo-sm text-destructive empty:hidden">
          {erroAcao}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={pendente}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={confirmar}
            disabled={pendente || travado !== null}
            aria-busy={pendente || undefined}
          >
            {pendente ? "Convertendo…" : "Converter em sócio e copiar clientes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
