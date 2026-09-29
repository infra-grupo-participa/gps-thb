"use client";

/**
 * O grupo **EMPRESA** da aba "Dados básicos" (migração `…308`, 24/09/2026):
 * razão social · CNPJ · ramo de atividade · regime tributário.
 *
 * Os quatro campos são OPCIONAIS — e estão VAZIOS em 100% dos 1.795 clientes
 * (medido em 29/09/2026). Por isso o grupo nasce num `<details>` FECHADO, com o
 * `<summary>` dizendo o que há dentro. Nada aqui trava o "Salvar ficha".
 *
 * 🔴 **Fechado nunca esconde dado nem erro.** Abre sozinho quando algum dos
 * quatro tem valor OU frase de recusa: informação dentro de `<details>` fechado
 * é informação invisível (o defeito que este portal já pagou várias vezes). O
 * foco automático do `ClienteFicha` (`focarQuandoVisivel`) também abre o
 * `<details>` que envolve o campo antes de focá-lo — o `onToggle` daqui devolve
 * essa abertura ao estado, para a próxima renderização não desfazê-la.
 *
 * ── 🔴 `null` = "não informado", NUNCA `—` mudo ─────────────────────────────
 * Campo vazio mostra o placeholder com a palavra escrita ("Não informado" no
 * regime; texto de ajuda nos demais).
 *
 * ── 🔴 A MÁSCARA É DA TELA; O BANCO RECEBE DÍGITO PURO ──────────────────────
 * `cnpj` no banco é `^[0-9]{14}$` (CHECK). A máscara `00.000.000/0000-00` vive
 * aqui (`mascaraCpfCnpj`, `src/lib/masks.ts`) e `soDigitos` desfaz antes de
 * `salvar()` montar o `PatchCliente`. Mandar o texto mascarado derrubaria a
 * ficha INTEIRA com 23514, porque o update é um só.
 *
 * ⚠️ O dígito verificador **não** é conferido, por decisão do Marcio
 * (24/09/2026): ficha de prospect não trava por um dígito trocado.
 *
 * ── Denso e chapado ────────────────────────────────────────────────────────
 * Rótulo, campo, ajuda, erro. Sem card, sem fonte grande. Duas colunas a
 * partir de `sm`, como o resto da ficha.
 */

import { useState } from "react";
import { Building2, ChevronRight } from "lucide-react";

import { REGIMES_TRIBUTARIOS, type RegimeTributario } from "@/lib/types";
import { mascaraCpfCnpj } from "@/lib/masks";
import {
  idDoErro,
  type ErrosDaFicha,
} from "@/components/clientes/ficha-abas-estado";
import { CampoErro } from "@/components/ui/campo-erro";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FichaPj({
  razaoSocial,
  onRazaoSocial,
  cnpj,
  onCnpj,
  ramo,
  onRamo,
  regime,
  onRegime,
  erros,
}: {
  razaoSocial: string;
  onRazaoSocial: (v: string) => void;
  /** MASCARADO — o `ClienteFicha` guarda assim e converte ao salvar. */
  cnpj: string;
  onCnpj: (v: string) => void;
  ramo: string;
  onRamo: (v: string) => void;
  /** `""` = não informado. Catálogo fechado `REGIMES_TRIBUTARIOS`. */
  regime: string;
  onRegime: (v: string) => void;
  /**
   * CNPJ digitado pela metade (1 a 13 dígitos). O CHECK do banco exige 14 ou
   * `null`, e um parcial derrubaria a ficha inteira com 23514 — o aviso mora
   * ao lado do campo e a mensagem do botão nomeia o campo.
   */
  /** Frase de erro por campo (`mensagensPorCampo`). Contrato: `ID_DO_CAMPO`. */
  erros?: ErrosDaFicha;
}) {
  const erroRazao = erros?.razao_social;
  const erroCnpj = erros?.cnpj;
  const erroRamo = erros?.ramo_atividade;
  const erroRegime = erros?.regime_tributario;

  const precisaAbrir =
    Boolean(razaoSocial.trim() || cnpj.trim() || ramo.trim() || regime) ||
    Boolean(erroRazao || erroCnpj || erroRamo || erroRegime);

  // Trava: abriu por valor ou erro, fica aberto mesmo que o campo seja apagado
  // a seguir — fechar sob o cursor de quem está digitando é pior que deixar
  // aberto. A pessoa ainda fecha pelo `<summary>`.
  const [aberto, setAberto] = useState(precisaAbrir);
  if (precisaAbrir && !aberto) setAberto(true);

  return (
    <details
      open={aberto}
      onToggle={(e) => setAberto(e.currentTarget.open)}
      className="group"
    >
      <summary className="foco-visivel flex min-h-6 w-fit cursor-pointer list-none items-center gap-2 rounded-xs text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open:rotate-90"
          aria-hidden
        />
        <Building2
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span>
          Se o cliente tiver empresa{" "}
          <span className="rotulo text-muted-foreground">(opcional)</span>
        </span>
      </summary>

      <div className="mt-4 grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="f-razao">
            Razão social{" "}
            <span className="rotulo text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="f-razao"
            value={razaoSocial}
            onChange={(e) => onRazaoSocial(e.target.value)}
            placeholder="Como a empresa está registrada na Receita"
            maxLength={200}
            aria-invalid={erroRazao ? "true" : undefined}
            aria-describedby={
              erroRazao
                ? `f-razao-ajuda ${idDoErro("razao_social")}`
                : "f-razao-ajuda"
            }
          />
          <p id="f-razao-ajuda" className="corpo-sm text-muted-foreground">
            {/* Explica a diferença que já confundiu no cadastro: `nome` é como
                o parceiro chama o cliente; este é o registrado. */}
            Só para cliente pessoa jurídica. Não é o nome pelo qual você o
            chama — esse fica no campo Nome, acima.
          </p>
          <CampoErro id={idDoErro("razao_social")} texto={erroRazao} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="f-cnpj">
              CNPJ{" "}
              <span className="rotulo text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="f-cnpj"
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => onCnpj(mascaraCpfCnpj(e.target.value))}
              placeholder="00.000.000/0000-00"
              aria-invalid={erroCnpj ? "true" : undefined}
              aria-describedby={
                erroCnpj ? `f-cnpj-ajuda ${idDoErro("cnpj")}` : "f-cnpj-ajuda"
              }
            />
            <p id="f-cnpj-ajuda" className="corpo-sm text-muted-foreground">
              Não informado enquanto estiver em branco.
            </p>
            <CampoErro id={idDoErro("cnpj")} texto={erroCnpj} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="f-ramo">
              Ramo de atividade{" "}
              <span className="rotulo text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="f-ramo"
              value={ramo}
              onChange={(e) => onRamo(e.target.value)}
              placeholder="Ex.: transportadora, clínica, comércio de peças"
              maxLength={120}
              aria-invalid={erroRamo ? "true" : undefined}
              aria-describedby={
                erroRamo
                  ? `f-ramo-ajuda ${idDoErro("ramo_atividade")}`
                  : "f-ramo-ajuda"
              }
            />
            <p id="f-ramo-ajuda" className="corpo-sm text-muted-foreground">
              {/* Não é CNAE e não há catálogo — o texto evita que alguém
                  procure um seletor que não existe. */}
              Texto livre. Não é CNAE.
            </p>
            <CampoErro id={idDoErro("ramo_atividade")} texto={erroRamo} />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="f-regime">
              Regime tributário{" "}
              <span className="rotulo text-muted-foreground">(opcional)</span>
            </Label>
            <Select value={regime} onValueChange={(v) => onRegime(v ?? "")}>
              <SelectTrigger
                id="f-regime"
                aria-invalid={erroRegime ? "true" : undefined}
                aria-describedby={
                  erroRegime
                    ? `f-regime-ajuda ${idDoErro("regime_tributario")}`
                    : "f-regime-ajuda"
                }
              >
                {/* Sem função de render o Base UI imprime o VALOR do banco
                    (`simples`). E `""` mostra o placeholder, que diz "Não
                    informado" — nunca um palpite sobre a empresa. */}
                <SelectValue placeholder="Não informado">
                  {(v: string) =>
                    REGIMES_TRIBUTARIOS.find((r) => r.valor === v)?.rotulo ??
                    "Não informado"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {REGIMES_TRIBUTARIOS.map((r) => (
                  <SelectItem key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="f-regime-ajuda" className="corpo-sm text-muted-foreground">
              Não informado enquanto você não escolher.
            </p>
            <CampoErro id={idDoErro("regime_tributario")} texto={erroRegime} />
          </div>
        </div>
      </div>
    </details>
  );
}

/** Os valores que o `Select` aceita — espelho do CHECK do banco. */
export function ehRegimeTributario(v: string): v is RegimeTributario {
  return REGIMES_TRIBUTARIOS.some((r) => r.valor === v);
}
