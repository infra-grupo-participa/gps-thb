"use client";

/**
 * Folha 2 da pasta — **REUNIÃO PRELIMINAR**.
 *
 * 🔴 O nome é "Reunião preliminar", literal do Marcio (24/09/2026) — **NUNCA
 * "Sessão de viabilidade"**. São dois atos diferentes do produto: a preliminar
 * é a conversa do parceiro com o lead (é ela que esta folha registra); a
 * sessão de viabilidade é com a equipe jurídica e vive em `/sessoes` — ela é
 * justamente o PRÓXIMO PASSO daqui, e aparece no fim como um link.
 *
 * O que mora nesta folha, na ordem em que a conversa acontece: a data e a
 * fase, o andamento do contato (os 4 marcos), os 7 problemas, o resultado do
 * DISC + a entrevista prévia, o próximo passo e o registro do contato.
 *
 * Apresentação pura — mesma regra de `ficha-aba-dados.tsx` e
 * `ficha-contrato.tsx`: recebe valor, devolve mudança, não conhece action
 * nenhuma. Todos os `useState` continuam no `ClienteFicha`, acima das abas —
 * é isso que faz o texto sobreviver à troca de folha e o que a barra de
 * salvar lê.
 */

import Link from "next/link";
import { Calendar } from "lucide-react";

import type { FaseCliente } from "@/lib/types";
import { FASES_CLIENTE, PERFIS_DISC, PROBLEMAS_7 } from "@/lib/etapa1";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DiscDialogo } from "@/components/clientes/disc-dialogo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FichaAbaPreliminar({
  fase,
  onFase,
  fasesDaFicha,
  faseAtual,
  confirmado,
  faseNoServidor,
  dataReuniao,
  onDataReuniao,
  msgPadrao,
  onMsgPadrao,
  estudoCaso,
  onEstudoCaso,
  ligacao,
  onLigacao,
  aderiu,
  onAderiu,
  problemas,
  onToggleProblema,
  problemasEmFalta,
  disc,
  setDisc,
  discConsciencia,
  setDiscConsciencia,
  discGatilhos,
  setDiscGatilhos,
  discRelacionamento,
  setDiscRelacionamento,
  painelEntrevista,
  qtdDecisores,
  admin,
  temEntrevistaConcluida,
  registro,
  onRegistro,
  fichaNova,
}: {
  fase: FaseCliente;
  onFase: (v: FaseCliente) => void;
  /** As fases que o banco ainda aceita para este cliente (§B.5). */
  fasesDaFicha: readonly (typeof FASES_CLIENTE)[number][];
  faseAtual: (typeof FASES_CLIENTE)[number] | undefined;
  confirmado: boolean;
  /** `cliente.fase` (servidor), para a frase da trava não ler o estado local. */
  faseNoServidor: FaseCliente | null;
  dataReuniao: string;
  onDataReuniao: (v: string) => void;
  msgPadrao: boolean;
  onMsgPadrao: (v: boolean) => void;
  estudoCaso: boolean;
  onEstudoCaso: (v: boolean) => void;
  ligacao: boolean;
  onLigacao: (v: boolean) => void;
  aderiu: boolean;
  onAderiu: (v: boolean) => void;
  problemas: string[];
  onToggleProblema: (id: string) => void;
  problemasEmFalta: boolean;
  disc: string;
  setDisc: (v: string) => void;
  discConsciencia: string;
  setDiscConsciencia: (v: string) => void;
  discGatilhos: string;
  setDiscGatilhos: (v: string) => void;
  discRelacionamento: string;
  setDiscRelacionamento: (v: string) => void;
  painelEntrevista: React.ReactNode;
  qtdDecisores: number | null;
  admin: boolean;
  temEntrevistaConcluida: boolean;
  registro: string;
  onRegistro: (v: string) => void;
  fichaNova: boolean;
}) {
  return (
    <div className="grid gap-8">
      {/* ── QUANDO E EM QUE PÉ ────────────────────────────────────────────
          Fase e data no topo da folha: hierarquia por POSIÇÃO — é o que
          responde "esta reunião já aconteceu?" antes de qualquer detalhe. */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="f-fase">Fase</Label>
          <Select
            value={fase}
            onValueChange={(v) => onFase((v as FaseCliente) || "prospeccao")}
          >
            <SelectTrigger id="f-fase" aria-describedby="f-fase-ajuda">
              {/* Sem função de render o Base UI imprime o VALOR do banco: a
                  ficha mostrava `quente`, `contratado` e `D`. */}
              <SelectValue>
                {(v: FaseCliente) =>
                  FASES_CLIENTE.find((f) => f.id === v)?.rotulo ?? v
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {/* Cliente confirmado não oferece "Prospecção": o banco recusa a
                  volta com 42501. Opção que só serve para falhar não é opção. */}
              {fasesDaFicha.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p
            id="f-fase-ajuda"
            className="text-xs leading-snug text-muted-foreground"
          >
            {faseAtual?.ajuda}
            {confirmado && faseNoServidor !== "prospeccao"
              ? " A equipe está acompanhando este cliente, então a fase não volta para Prospecção."
              : null}
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="f-data">Data da reunião preliminar</Label>
          {/* 🔴 `flex h-8 items-center` NÃO é decoração — é a correção do
              "ícone quebrado, caindo para baixo".
              Duas coisas somadas: (a) a coluna do lado ("Fase") tem texto de
              ajuda, então a linha do grid ESTICA e o `div.relative` ficava com
              44,3 px em vez dos 32 do campo; (b) o `input[type=date]` do
              Chrome é inline-block e assenta na BASELINE, o que sozinho já
              deixava o wrapper mais alto que o campo. Como o ícone é
              `absolute top-1/2`, ele se centralizava na caixa esticada e saía
              **6,1 px abaixo** do centro do campo, encostando na borda de
              baixo (medido no Chromium em 1366 e 390; depois da correção o
              desvio é 0,0).
              `h-8` trava a altura na do `Input` e o `flex` elimina a caixa de
              linha. Os campos de texto não sofrem disso — por isso a correção
              é aqui, e não em `ui/input.tsx`. */}
          <div className="relative flex h-8 items-center">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="f-data"
              type="date"
              value={dataReuniao}
              onChange={(e) => onDataReuniao(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* ── ANDAMENTO DO CONTATO — os 4 marcos ─────────────────────────── */}
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm leading-none font-medium">
          Andamento do contato
        </legend>
        <div className="grid gap-2 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={msgPadrao}
              onCheckedChange={(v) => onMsgPadrao(Boolean(v))}
            />
            Mensagem padrão enviada
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={estudoCaso}
              onCheckedChange={(v) => onEstudoCaso(Boolean(v))}
            />
            Estudo de caso enviado
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={ligacao}
              onCheckedChange={(v) => onLigacao(Boolean(v))}
            />
            Ligação realizada
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={aderiu}
              onCheckedChange={(v) => onAderiu(Boolean(v))}
            />
            Aderiu à reunião (grupo de WhatsApp)
          </label>
        </div>
      </fieldset>

      {/* ── OS 7 PROBLEMAS ──────────────────────────────────────────────
          UX5 — grupo de checkboxes não tem um controle único para apontar: o
          rótulo vira legenda de um `fieldset`, que é a forma correta de nomear
          o conjunto (WCAG 1.3.1). O `fieldset` já É o grupo (o `legend` o
          nomeia): a explicação da recusa entra por `aria-describedby` NELE,
          não numa `div` com `role="group"` — que não aceita `aria-invalid`. */}
      <fieldset
        className="grid gap-2"
        aria-describedby={problemasEmFalta ? "f-problemas-erro" : undefined}
      >
        <legend className="mb-2 text-sm leading-none font-medium">
          Problemas (marque ao menos um)
        </legend>
        <div
          className={cn(
            "grid gap-2 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2",
            problemasEmFalta && "outline-2 outline-atencao-foreground",
          )}
        >
          {PROBLEMAS_7.map((p) => (
            <label
              key={p.id}
              className="flex items-start gap-2 text-sm leading-tight"
            >
              <Checkbox
                checked={problemas.includes(p.id)}
                onCheckedChange={() => onToggleProblema(p.id)}
                className="mt-0.5"
              />
              <span>{p.rotulo}</span>
            </label>
          ))}
        </div>
        {problemasEmFalta ? (
          // Sem `role="alert"`: a barra de salvar já anuncia. Aqui é a marca
          // visual ao lado do campo, para o olho achar onde voltar.
          <p id="f-problemas-erro" className="corpo-sm text-atencao-foreground">
            Nenhum problema marcado — é o que qualifica um cliente de holding
            (tarefa 1). A ficha salva mesmo assim; marque quando souber.
          </p>
        ) : null}
      </fieldset>

      {/* ═══════════════════════════════════════════════════════════════
          O PERFIL DISC — UMA LINHA NA FICHA, A EDIÇÃO NO POP-UP
          ═══════════════════════════════════════════════════════════════

          Denso e chapado: hierarquia por POSIÇÃO (rótulo à esquerda, valor ao
          lado, ação à direita). Sem card, sem ícone, sem fonte grande.

          🔑 A ENTREVISTA PRÉVIA CONTINUA SENDO UMA ROTA, NÃO UM DIÁLOGO
          (decisão de 23/09/2026: a conversa dura 15-20 min ao vivo e um modal
          que fecha no Esc perderia tudo). O que entrou no pop-up é o BOTÃO que
          leva à rota `/clientes/[id]/entrevista`; o formulário segue em página
          própria, com URL própria. Quem ler "agora é diálogo" e trouxer o
          formulário para dentro estará revogando uma decisão que NÃO foi
          revogada.

          🔑 `painelEntrevista` vem PRONTO da página (Server Component): o
          painel lê decisores e histórico, e a ficha é `"use client"`. Ele só
          atravessa o `DiscDialogo` como `ReactNode` — continua sendo markup do
          servidor, não vira componente cliente e **não custa consulta nenhuma
          ao abrir, nem ao trocar de aba**.

          🔑 O rótulo do DISC sai de `PERFIS_DISC`; valor fora da lista aparece
          CRU, que é o que o `SelectValue` do diálogo já faz. Nunca inventar
          rótulo para código desconhecido. */}
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="grid gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="rotulo text-muted-foreground">Perfil DISC</span>
              <span className="corpo-sm">
                {disc
                  ? (PERFIS_DISC.find((d) => d.id === disc)?.rotulo ?? disc)
                  : "— não definido"}
              </span>
            </div>
            {/* 🔴 O SINAL DE PENDÊNCIA — texto, não badge, não ícone. Regra do
                Marcio: *"para realizar a reunião preliminar, todos os
                decisores precisam"*. Aparece SÓ com mais de um decisor: com um
                só não há trava a avisar.

                🔴 `qtdDecisores == null` (modo assistência, sem a RPC) não
                mostra nada. Ausência de dado não vira afirmação de que não há
                decisor. */}
            {qtdDecisores != null && qtdDecisores > 1 ? (
              <p className="corpo-sm text-accent-foreground">
                {qtdDecisores} decisores · a Preliminar exige todos presentes
              </p>
            ) : null}
          </div>

          <DiscDialogo
            // 🔴 VALOR + SETTER, nunca cópia. Os quatro estados continuam
            // morando no `ClienteFicha`: é deles que `alterado`/`alteradoPorAba`
            // (a barra sticky e a marca da aba) e `salvar()` leem. Cópia local
            // dentro do diálogo seria a segunda fonte de verdade — o texto
            // digitado sumiria do "Salvar ficha" e a barra nunca acusaria
            // pendência. Efeito colateral bom: fechar no Esc não perde nada.
            disc={disc}
            setDisc={setDisc}
            discConsciencia={discConsciencia}
            setDiscConsciencia={setDiscConsciencia}
            discGatilhos={discGatilhos}
            setDiscGatilhos={setDiscGatilhos}
            discRelacionamento={discRelacionamento}
            setDiscRelacionamento={setDiscRelacionamento}
            painelEntrevista={painelEntrevista}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            O PRÓXIMO PASSO — UMA LINHA, FORA DO POP-UP
            ═══════════════════════════════════════════════════════════════

            Pedido do Marcio (23/09/2026): *"a gente tem que prosseguir depois
            da entrevista prévia para lá [a sessão]. Esse é o buraco na parte
            do sistema. A gente precisa ter algo que guie a pessoa para lá, com
            uma sugestão"*.

            🔴 FICA NA FICHA, NUNCA DENTRO DO `DiscDialogo`. É justamente o
            sinal que precisa ser visto SEM clicar — dentro do pop-up ele só
            apareceria para quem já abriu a janela, que é quem menos precisa da
            dica. E fica nesta FOLHA, que é a da reunião preliminar: o próximo
            passo da preliminar é a sessão.

            🔴 DENSO E CHAPADO: rótulo à esquerda, frase ao lado, link no fim —
            a MESMA gramática da linha do DISC logo acima. Sem card, sem ícone,
            sem fonte grande, sem cor de alerta.

            🔴 `admin` é condição, não só `temEntrevistaConcluida`: a rota
            `/sessoes` existe SÓ para o aluno (`nav.ts`, filtro
            `basePath === ""`). No modo assistência isto some. As duas travas
            são redundantes de propósito: a page do admin já não passa a prop,
            e mesmo que um dia passe, o link não nasce aqui.

            ⚠️ O aviso de decisores continua ACIMA, na linha do DISC, e não é
            repetido aqui: dois textos dizendo a mesma trava em 40 px de
            distância viram ruído. */}
        {!admin && temEntrevistaConcluida ? (
          <p className="corpo-sm flex flex-wrap items-baseline gap-x-2">
            <span className="rotulo text-muted-foreground">Próximo passo</span>
            <span>
              Entrevista feita.{" "}
              <Link
                href="/sessoes"
                className="foco-visivel rounded-xs font-medium underline underline-offset-2 hover:text-accent-foreground"
              >
                Marque a sessão com a equipe jurídica
              </Link>
              {qtdDecisores != null && qtdDecisores > 1
                ? " — com todos os decisores presentes."
                : "."}
            </span>
          </p>
        ) : null}
      </div>

      {/* ── REGISTRO DO CONTATO ─────────────────────────────────────────── */}
      <div className="grid gap-2">
        <Label htmlFor="f-reg">Registro do contato</Label>
        <Textarea
          id="f-reg"
          value={registro}
          onChange={(e) => onRegistro(e.target.value)}
          disabled={fichaNova}
          aria-describedby={fichaNova ? "f-reg-ajuda" : undefined}
          placeholder="Anotações sobre as conversas, ligações e combinados."
          rows={4}
        />
        {fichaNova ? (
          <p id="f-reg-ajuda" className="corpo-sm text-muted-foreground">
            {/* Dizia "quando voltar a esta ficha", e quem acabou de digitar o
                telefone via o campo ainda cinza e achava que precisava sair e
                entrar de novo. */}
            Salve o telefone e este campo abre.
          </p>
        ) : null}
      </div>
    </div>
  );
}
