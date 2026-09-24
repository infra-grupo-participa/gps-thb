"use client";

/**
 * Folha 1 da pasta — **DADOS BÁSICOS**: nome, telefone, grau de relação e o
 * grupo de PESSOA JURÍDICA.
 *
 * Saiu de `cliente-ficha.tsx` sem uma linha de lógica nova, pela mesma razão
 * de `ficha-contrato.tsx`: é apresentação pura — recebe valor, devolve
 * mudança, não conhece action nenhuma. Quem valida, normaliza e salva continua
 * sendo a ficha (e, de verdade, os CHECKs do banco). A ficha tinha 1.033
 * linhas e o padrão da casa é "componente cortado fica com index de até 400".
 *
 * 🔴 **Esta folha é a que BLOQUEIA o salvar.** Nome e telefone são o que faz a
 * ficha contar para os 30 da Etapa 01, e o botão "Salvar ficha" fica
 * desabilitado sem eles. É por isso que a validação PUXA a pessoa para cá
 * (`abaDaPendencia`) e o foco vai para o campo — deixar o botão morto numa
 * outra folha, sem dizer onde está o problema, é o defeito que a fatia inteira
 * existe para não criar.
 *
 * 🔑 Os `id` dos campos (`f-nome`, `f-tel`) são contrato com o `ClienteFicha`:
 * é por eles que o foco é movido quando o salvar falha. Renomear aqui sem
 * renomear lá deixa o foco no lugar errado, em silêncio.
 */

import { Building2, Phone, User } from "lucide-react";

import { GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Secao } from "@/components/ui/secao";
import { FichaPj } from "@/components/clientes/ficha-pj";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FichaAbaDados({
  nome,
  onNome,
  telefone,
  onTelefone,
  grau,
  onGrau,
  razaoSocial,
  onRazaoSocial,
  cnpj,
  onCnpj,
  ramo,
  onRamo,
  regime,
  onRegime,
  cnpjInvalido,
  mascaraTelefone,
}: {
  nome: string;
  onNome: (v: string) => void;
  telefone: string;
  onTelefone: (v: string) => void;
  grau: string;
  onGrau: (v: string) => void;
  razaoSocial: string;
  onRazaoSocial: (v: string) => void;
  cnpj: string;
  onCnpj: (v: string) => void;
  ramo: string;
  onRamo: (v: string) => void;
  regime: string;
  onRegime: (v: string) => void;
  cnpjInvalido: boolean;
  /** Passada por prop para a folha não importar `masks` só por isto. */
  mascaraTelefone: (v: string) => string;
}) {
  return (
    <div className="grid gap-8">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="f-nome">Nome</Label>
          <div className="relative">
            <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="f-nome"
              value={nome}
              onChange={(e) => onNome(e.target.value)}
              placeholder="Nome do cliente"
              className="pl-9"
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="f-tel">Telefone</Label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="f-tel"
              inputMode="tel"
              value={telefone}
              onChange={(e) => onTelefone(mascaraTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
              className="pl-9"
              aria-describedby="f-tel-ajuda"
            />
          </div>
          {/* 🔴 MEDIDO EM 10/09/2026: 17 fichas estavam paradas só por falta
              de telefone — a pessoa digitou o nome, a ficha não conta para os
              30 e ela não tinha como saber por quê. O campo vizinho (grau de
              relação), que NÃO conta, tinha texto de apoio; este, que decide a
              Etapa 01, não tinha nenhum. */}
          <p id="f-tel-ajuda" className="corpo-sm text-muted-foreground">
            {telefone.trim()
              ? "Com nome e telefone, esta ficha conta para os 30 da Etapa 01."
              : "Sem o telefone, esta ficha ainda não conta para os 30 da Etapa 01."}
          </p>
        </div>

        {/* GRAU DE RELAÇÃO — o campo "Nível de relacionamento" (quente/morno/
            frio) que existia ao lado deste foi REMOVIDO por decisão do Marcio
            (10/09/2026); grau é TIPO DE VÍNCULO e continua. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="f-grau">Grau de relação</Label>
            <Select value={grau} onValueChange={(v) => onGrau(v ?? "")}>
              <SelectTrigger id="f-grau" aria-describedby="f-grau-ajuda">
                {/* Sem função de render o Base UI imprime o VALOR do banco
                    (`cliente_atual`). E `""` mostra o placeholder, que diz
                    "Não informado" — NUNCA "Lead": a ausência de resposta
                    sobre um terceiro não vira palpite sobre a vida dele. */}
                <SelectValue placeholder="Não informado">
                  {(v: string) =>
                    GRAUS_RELACAO_UI.find((g) => g.id === v)?.rotulo ??
                    "Não informado"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {GRAUS_RELACAO_UI.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p
              id="f-grau-ajuda"
              className="text-xs leading-snug text-muted-foreground"
            >
              {GRAUS_RELACAO_UI.find((g) => g.id === grau)?.ajuda ??
                "Como você conhece esta pessoa. Não informado enquanto você não escolher."}
            </p>
          </div>
        </div>
      </div>

      {/* PESSOA JURÍDICA — `Secao` (marcador + título + régua) e não um card
          dentro do corpo da aba: a folha já É a caixa. Hierarquia por POSIÇÃO,
          o grupo opcional vem depois do que é obrigatório. */}
      <Secao
        /* `icone` e não `numero`: preencher a ficha não é uma sequência de
           passos, e numeração decorativa é justamente o clichê que `Secao`
           existe para não reintroduzir. O marcador é `size-6` — "PJ" em texto
           estouraria a caixa. */
        icone={<Building2 />}
        titulo="Pessoa jurídica"
        nivel="h3"
        descricao="Preencha só se este cliente tem empresa. Nada aqui é obrigatório."
        classeConteudo="grid gap-5"
      >
        <FichaPj
          razaoSocial={razaoSocial}
          onRazaoSocial={onRazaoSocial}
          cnpj={cnpj}
          onCnpj={onCnpj}
          ramo={ramo}
          onRamo={onRamo}
          regime={regime}
          onRegime={onRegime}
          cnpjInvalido={cnpjInvalido}
        />
      </Secao>
    </div>
  );
}
