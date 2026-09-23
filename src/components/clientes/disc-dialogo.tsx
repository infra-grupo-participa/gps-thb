"use client";

import { PERFIS_DISC } from "@/lib/etapa1";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * O perfil DISC do cliente — botão na ficha, edição no diálogo.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SEM SEGUNDA FONTE DE VERDADE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os quatro campos continuam sendo `useState` do `ClienteFicha` — aqui só
 * chegam **valor + setter por prop**. Uma cópia local (`useState(disc)` dentro
 * deste componente) pareceria funcionar e quebraria duas coisas ao mesmo tempo:
 *
 *   1. o `alterado` do `ClienteFicha`, que alimenta o "Você tem alterações não
 *      salvas" da barra sticky — ele compara os estados de lá contra o
 *      `cliente` do servidor, e não veria nada do que foi digitado aqui;
 *   2. o próprio "Salvar ficha", que envia os estados de lá.
 *
 * O efeito prático: fechar o diálogo no Esc **não perde nada**, porque nada
 * mora aqui. O que foi digitado continua no pai, montado, e a barra continua
 * avisando que há pendência.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 O PAINEL DA ENTREVISTA É `ReactNode` DO SERVIDOR — NÃO VIRA CLIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `painelEntrevista` chega renderizado pela page (Server Component) e atravessa
 * este Client Component como children opaco. **Não buscar nada no clique**
 * (`useEffect`, `fetch`, server action): seria uma consulta nova por abertura
 * de diálogo, na tela mais usada do produto — e o painel já vem no mesmo
 * `Promise.all` que a page paga uma vez.
 *
 * O custo aceito é ~1 KB de markup no payload inicial mesmo com o diálogo
 * fechado. É markup, não consulta.
 *
 * Salvar continua sendo o "Salvar ficha" de sempre (`atualizarCliente`). Este
 * componente não tem action, não tem botão de salvar e não toca no banco.
 */
export function DiscDialogo({
  disc,
  setDisc,
  discConsciencia,
  setDiscConsciencia,
  discGatilhos,
  setDiscGatilhos,
  discRelacionamento,
  setDiscRelacionamento,
  painelEntrevista = null,
}: {
  disc: string;
  setDisc: (v: string) => void;
  discConsciencia: string;
  setDiscConsciencia: (v: string) => void;
  discGatilhos: string;
  setDiscGatilhos: (v: string) => void;
  discRelacionamento: string;
  setDiscRelacionamento: (v: string) => void;
  /**
   * O painel da Entrevista Prévia, montado no SERVIDOR. `null` no modo
   * assistência: quem entrevista é o parceiro, ao telefone com o lead.
   */
  painelEntrevista?: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Ver perfil
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Perfil do cliente</DialogTitle>
          <DialogDescription>
            O que foi salvo aqui entra na ficha ao clicar em &quot;Salvar
            ficha&quot;. Fechar esta janela não perde o que você digitou.
          </DialogDescription>
        </DialogHeader>

        {/* 🔴 A ENTREVISTA PRÉVIA 2.0 (23/09/2026, pedido do Marcio: "tem que
            ter na aba do cliente um botão pra iniciar a entrevista prévia").

            🔑 A DECISÃO DE 23/09 CONTINUA DE PÉ: a entrevista é uma ROTA
            (`/clientes/[id]/entrevista`), NÃO um diálogo. A conversa dura
            15-20 min ao vivo e um modal que fecha no Esc perderia tudo. O que
            passou a morar dentro deste pop-up é o BOTÃO que leva à rota — a
            entrevista em si segue em página própria, com a URL dela.
            Quem ler isto e concluir "o modal foi liberado, pode trazer o
            formulário para cá" estará revogando uma decisão que não foi
            revogada.

            🔑 Só para o PARCEIRO: quem conduz a entrevista é quem está ao
            telefone com o lead. No modo assistência a prop chega `null` e
            entra a linha abaixo — nunca uma moldura vazia, que leria como
            defeito de carregamento. */}
        {painelEntrevista ?? (
          <p className="corpo-sm text-muted-foreground">
            A entrevista é conduzida pelo parceiro.
          </p>
        )}

        <div className="grid gap-2">
          <Label htmlFor="f-disc">Perfil DISC</Label>
          <Select value={disc} onValueChange={(v) => setDisc(v ?? "")}>
            <SelectTrigger id="f-disc">
              <SelectValue placeholder="—">
                {(v: string) => PERFIS_DISC.find((d) => d.id === v)?.rotulo ?? v}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PERFIS_DISC.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            O DISC ALÉM DA LETRA (pedido 5 do Marcio, 23/09/2026)
            ═══════════════════════════════════════════════════════════════

            Denso e chapado: três campos empilhados abaixo do Select, agora
            dentro deste diálogo (antes ficavam na `Secao` "Registro e perfil",
            empurrando o resto da ficha para baixo). Não é card, não tem ícone
            — a hierarquia é a POSIÇÃO.

            🔴 Campo em branco é o estado NORMAL, não um erro: no dia do
            deploy, 34 de 34 favoritos estão assim (medido em 23/09). Por
            isso nenhum dos três é obrigatório, nenhum marca `aria-invalid`
            sozinho e o `placeholder` ensina o que escrever em vez de cobrar.

            🔴 `maxLength={2000}` espelha o teto do CHECK. O piso de 3 é
            conferido em `salvar()` (`discRicoCurto`), no `ClienteFicha` —
            travar a digitação no 3º caractere impediria de apagar.

            🔑 Os `id` vieram junto com os campos: os `<Label htmlFor>`
            dependem deles e a mudança de casa não pode quebrar o par. */}
        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="f-disc-consc">
              Consciência{" "}
              <span className="rotulo text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="f-disc-consc"
              value={discConsciencia}
              onChange={(e) => setDiscConsciencia(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="O quanto essa pessoa já percebe o problema que a holding resolve."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="f-disc-gat">
              Gatilhos{" "}
              <span className="rotulo text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="f-disc-gat"
              value={discGatilhos}
              onChange={(e) => setDiscGatilhos(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="O que move e o que trava essa pessoa numa conversa de decisão."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="f-disc-rel">
              Relacionamento{" "}
              <span className="rotulo text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="f-disc-rel"
              value={discRelacionamento}
              onChange={(e) => setDiscRelacionamento(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Como conduzir a conversa com ela: ritmo, tom, o que evitar."
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
