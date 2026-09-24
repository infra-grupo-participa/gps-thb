"use client";

/**
 * O grupo **PESSOA JURÍDICA** da aba "Dados básicos" (migração `…308`,
 * 24/09/2026): razão social · CNPJ · ramo de atividade · regime tributário.
 *
 * Os quatro campos são OPCIONAIS. Um cliente de holding pode ser só pessoa
 * física — e a maioria das fichas em uso hoje é. O grupo aparece sempre (não
 * se esconde um campo atrás de um "adicionar empresa": a pessoa não descobre
 * o que não vê), mas nada aqui trava o "Salvar ficha".
 *
 * ── 🔴 `null` = "não informado", NUNCA `—` mudo ─────────────────────────────
 * Campo vazio mostra o placeholder com a palavra escrita ("Não informado" no
 * regime; texto de ajuda nos demais). Um travessão sozinho não diz se a
 * resposta é "não tem" ou "ninguém perguntou". É a mesma regra já aplicada em
 * "Grau de relação".
 *
 * ── 🔴 A MÁSCARA É DA TELA; O BANCO RECEBE DÍGITO PURO ──────────────────────
 * `cnpj` no banco é `^[0-9]{14}$` (CHECK). A máscara `00.000.000/0000-00` vive
 * aqui (`mascaraCpfCnpj`, `src/lib/masks.ts`) e `soDigitos` desfaz antes de
 * `salvar()` montar o `PatchCliente`. Mandar o texto mascarado derrubaria a
 * ficha INTEIRA com 23514, porque o update é um só.
 *
 * ⚠️ O dígito verificador **não** é conferido, por decisão do Marcio
 * (24/09/2026): ficha de prospect não trava por um dígito trocado. `masks.ts`
 * tem `cnpjValido` e ele segue sem ser chamado aqui — de propósito.
 *
 * ── Denso e chapado ────────────────────────────────────────────────────────
 * Rótulo, campo, ajuda. Sem card dentro de card, sem ícone decorativo, sem
 * fonte grande. Duas colunas a partir de `sm`, como o resto da ficha.
 */

import { REGIMES_TRIBUTARIOS, type RegimeTributario } from "@/lib/types";
import { mascaraCpfCnpj, soDigitos } from "@/lib/masks";
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
  cnpjInvalido,
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
  cnpjInvalido: boolean;
}) {
  const digitos = soDigitos(cnpj);

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label htmlFor="f-razao">Razão social</Label>
        <Input
          id="f-razao"
          value={razaoSocial}
          onChange={(e) => onRazaoSocial(e.target.value)}
          placeholder="Como a empresa está registrada na Receita"
          maxLength={200}
          aria-describedby="f-razao-ajuda"
        />
        <p id="f-razao-ajuda" className="corpo-sm text-muted-foreground">
          {/* Explica a diferença que já confundiu no cadastro: `nome` é como o
              parceiro chama o cliente; este é o registrado. */}
          Só para cliente pessoa jurídica. Não é o nome pelo qual você o chama
          — esse fica no campo Nome, acima.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="f-cnpj">CNPJ</Label>
          <Input
            id="f-cnpj"
            inputMode="numeric"
            value={cnpj}
            onChange={(e) => onCnpj(mascaraCpfCnpj(e.target.value))}
            placeholder="00.000.000/0000-00"
            aria-invalid={cnpjInvalido || undefined}
            aria-describedby="f-cnpj-ajuda"
          />
          <p
            id="f-cnpj-ajuda"
            className={
              cnpjInvalido
                ? "corpo-sm text-atencao-foreground"
                : "corpo-sm text-muted-foreground"
            }
          >
            {cnpjInvalido
              ? `CNPJ incompleto — ${digitos.length} de 14 dígitos. Complete ou deixe em branco.`
              : "Opcional. Não informado enquanto estiver em branco."}
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="f-ramo">Ramo de atividade</Label>
          <Input
            id="f-ramo"
            value={ramo}
            onChange={(e) => onRamo(e.target.value)}
            placeholder="Ex.: transportadora, clínica, comércio de peças"
            maxLength={120}
            aria-describedby="f-ramo-ajuda"
          />
          <p id="f-ramo-ajuda" className="corpo-sm text-muted-foreground">
            {/* Não é CNAE e não há catálogo — o texto evita que alguém procure
                um seletor que não existe. */}
            Texto livre. Não é CNAE.
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="f-regime">Regime tributário</Label>
          <Select value={regime} onValueChange={(v) => onRegime(v ?? "")}>
            <SelectTrigger id="f-regime" aria-describedby="f-regime-ajuda">
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
        </div>
      </div>
    </div>
  );
}

/** Os valores que o `Select` aceita — espelho do CHECK do banco. */
export function ehRegimeTributario(v: string): v is RegimeTributario {
  return REGIMES_TRIBUTARIOS.some((r) => r.valor === v);
}
