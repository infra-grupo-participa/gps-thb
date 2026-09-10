"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ClienteEtapa1, FaseCliente, GrauRelacao } from "@/lib/types";
import {
  PROBLEMAS_7,
  NIVEIS_RELACIONAMENTO,
  FASES_CLIENTE,
  GRAUS_RELACAO_UI,
  PERFIS_DISC,
  META_HONORARIOS,
} from "@/lib/etapa1";
import {
  mascaraMoeda,
  mascaraTelefone,
  moedaParaNumero,
  numeroParaMoeda,
} from "@/lib/masks";
import {
  MessageCircle,
  Star,
  Phone,
  Calendar,
  User,
  IdCard,
  ListChecks,
  NotebookPen,
} from "lucide-react";
import { atualizarCliente, definirClienteEquipe } from "@/app/clientes/actions";
import { brlInteiro } from "@/lib/moeda";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Card, CardContent } from "@/components/ui/card";
import { Secao } from "@/components/ui/secao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogoDesfavoritar } from "@/components/clientes/dialogo-desfavoritar";
import { FichaContrato } from "@/components/clientes/ficha-contrato";
import {
  AcoesAcompanhamento,
  AvisoAcompanhamento,
  AvisoOutroConfirmado,
} from "@/components/clientes/acompanhamento-equipe";
import {
  fasesDisponiveis,
  travadoPelaEquipe,
} from "@/components/clientes/clientes-manager/ordenacao";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Só para a copy do campo de honorários — sem centavos, que aqui só ocupam espaço. */
const brlMeta = brlInteiro(META_HONORARIOS);

export function ClienteFicha({
  cliente,
  alunoId,
  admin = false,
  outroConfirmadoNome = null,
}: {
  cliente: ClienteEtapa1;
  alunoId: string;
  /**
   * Modo assistência. Só com `true` aparecem "Confirmar acompanhamento" e
   * "Liberar acompanhamento" — quem autoriza mesmo é o `gp_is_admin()` das
   * RPCs `...203`; aqui é a diferença entre oferecer e não oferecer.
   */
  admin?: boolean;
  /**
   * Nome do cliente que a equipe JÁ acompanha no ambiente, quando não é este.
   * `null` = não há outro confirmado. Com um confirmado em outro cliente, a
   * estrela desta ficha some (o banco recusaria a troca) e o motivo é escrito.
   */
  outroConfirmadoNome?: string | null;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(cliente.nome ?? "");
  const [telefone, setTelefone] = useState(
    cliente.telefone ? mascaraTelefone(cliente.telefone) : "",
  );
  const [nivel, setNivel] = useState(cliente.nivel_relacionamento ?? "");
  const [grau, setGrau] = useState<string>(cliente.grau_relacao ?? "");
  const [problemas, setProblemas] = useState<string[]>(cliente.problemas ?? []);
  const [perda, setPerda] = useState(numeroParaMoeda(cliente.perda_inercia));
  const [fase, setFase] = useState<FaseCliente>(
    cliente.fase ?? "prospeccao",
  );
  const [dataReuniao, setDataReuniao] = useState(
    cliente.data_reuniao_preliminar ?? "",
  );
  const [disc, setDisc] = useState(cliente.perfil_disc ?? "");
  const [aderiu, setAderiu] = useState(cliente.aderiu_reuniao);
  const [msgPadrao, setMsgPadrao] = useState(cliente.mensagem_padrao_enviada);
  const [estudoCaso, setEstudoCaso] = useState(cliente.estudo_caso_enviado);
  const [ligacao, setLigacao] = useState(cliente.ligacao_realizada);
  const [registro, setRegistro] = useState(cliente.registro_contato ?? "");
  const [acompanhado, setAcompanhado] = useState(cliente.acompanhado_equipe);
  /**
   * PL11 — desmarcar a estrela aqui trava os passos 4 a 8 da Etapa 01, igual
   * a desmarcá-la na lista. A lista já confirmava; a ficha desligava num
   * clique. `true` = diálogo aberto. Só o DESLIGAR pergunta: ligar é
   * reversível e não tranca nada.
   */
  const [desfavoritando, setDesfavoritando] = useState(false);
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  /**
   * Falha da estrela FORA do diálogo (o caminho de ligar, que é um clique só).
   * Fica na tela, com `role="alert"`: a frase que vem da action já é a
   * traduzida do banco ("A equipe está acompanhando este cliente…") e é a única
   * pista do que aconteceu — um toast a apagaria em 4 segundos.
   */
  const [erroEstrela, setErroEstrela] = useState<string | null>(null);
  // Honorários e link do contrato (Fase 7-B). Ficam no estado mesmo quando a
  // fase não é "contratado": o valor SOBREVIVE à volta de fase (B9-b) e é
  // reenviado como está — mudar de fase nunca apaga o que o aluno digitou.
  const [honorarios, setHonorarios] = useState(
    numeroParaMoeda(cliente.valor_honorarios),
  );
  const [contratoUrl, setContratoUrl] = useState(cliente.contrato_url ?? "");
  const [pending, startTransition] = useTransition();

  const wpp = linkWhatsapp(telefone);
  const contratoLimpo = contratoUrl.trim();
  const faseAtual = FASES_CLIENTE.find((f) => f.id === fase);

  /**
   * A equipe assumiu ESTE cliente? Vem do dado do servidor, nunca do estado
   * local: a confirmação é escrita da equipe e não passa pelo formulário.
   */
  const confirmado = travadoPelaEquipe(cliente);
  /** As fases que o banco ainda aceita para este cliente (§B.5). */
  const fasesDaFicha = fasesDisponiveis(cliente);
  /**
   * A estrela só aparece quando ela pode funcionar: sem confirmado no ambiente,
   * ou quando o confirmado é este mesmo cliente (aí ela vira leitura). Com
   * outro cliente confirmado, o botão só teria um destino — falhar com 42501.
   */
  const mostraEstrela = !confirmado && outroConfirmadoNome == null;

  /**
   * Há edição pendente na tela?
   *
   * 🔑 A ficha tem 1.000 px de rolagem e o "Salvar" morava no fim dela, sem
   * barra fixa e sem nenhum sinal de que algo tinha mudado: dava para digitar
   * a perda pela inércia de um cliente, rolar para cima, trocar de aba e
   * perder tudo em silêncio. A comparação é contra o `cliente` que veio do
   * servidor — a mesma origem dos `useState` iniciais —, campo a campo e na
   * MESMA normalização que `salvar()` envia (`trim`, `|| null`, máscara de
   * telefone). Se divergir, a barra mente nos dois sentidos.
   */
  const alterado =
    nome.trim() !== (cliente.nome ?? "").trim() ||
    (telefone.trim() || null) !==
      (cliente.telefone ? mascaraTelefone(cliente.telefone) : null) ||
    (nivel || null) !== (cliente.nivel_relacionamento ?? null) ||
    (grau || null) !== (cliente.grau_relacao ?? null) ||
    problemas.length !== (cliente.problemas ?? []).length ||
    problemas.some((p) => !(cliente.problemas ?? []).includes(p)) ||
    perda !== numeroParaMoeda(cliente.perda_inercia) ||
    fase !== (cliente.fase ?? "prospeccao") ||
    (dataReuniao || null) !== (cliente.data_reuniao_preliminar ?? null) ||
    (disc || null) !== (cliente.perfil_disc ?? null) ||
    aderiu !== cliente.aderiu_reuniao ||
    msgPadrao !== cliente.mensagem_padrao_enviada ||
    estudoCaso !== cliente.estudo_caso_enviado ||
    ligacao !== cliente.ligacao_realizada ||
    (registro.trim() || null) !== (cliente.registro_contato ?? null) ||
    honorarios !== numeroParaMoeda(cliente.valor_honorarios) ||
    (contratoLimpo || null) !== (cliente.contrato_url ?? null);

  const contratado = fase === "contratado";
  const honorariosValor = moedaParaNumero(honorarios);
  // Mesma regra do CHECK no banco (migração ...090): https, sem espaço, de 12 a
  // 2000 caracteres. Aqui é conveniência — a garantia é a do banco.
  const contratoInvalido =
    contratoLimpo !== "" &&
    (!/^https:\/\/[^\s]+$/.test(contratoLimpo) ||
      contratoLimpo.length < 12 ||
      contratoLimpo.length > 2000);

  function toggleEquipe() {
    if (acompanhado) {
      setErroDialogo(null);
      setDesfavoritando(true);
      return;
    }
    aplicarEquipe(true);
  }

  function aplicarEquipe(ativar: boolean) {
    setErroEstrela(null);
    setAcompanhado(ativar);
    startTransition(async () => {
      const res = await definirClienteEquipe(cliente.id, alunoId, ativar);
      if (res.erro) {
        // Desfaz o otimismo: sem isto a estrela ficaria mentindo na tela.
        setAcompanhado(!ativar);
        // A frase vem TRADUZIDA da action (`traduzirErroBanco` + as entradas
        // de `FRASES_DO_BANCO`): trocá-la por "Erro ao mudar o cliente da
        // equipe" apagaria justamente o que explica a trava e o que fazer.
        setErroDialogo(res.erro);
        setErroEstrela(res.erro);
        return;
      }
      setDesfavoritando(false);
    });
  }

  function toggleProblema(id: string) {
    setProblemas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function salvar() {
    if (contratoInvalido) {
      toast.error(
        "O link do contrato precisa começar com https:// e não pode ter espaços.",
      );
      return;
    }
    startTransition(async () => {
      const res = await atualizarCliente(cliente.id, alunoId, {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        nivel_relacionamento:
          (nivel as ClienteEtapa1["nivel_relacionamento"]) || null,
        // `""` (campo esvaziado) vira `null` = NÃO INFORMADO. A action repete
        // esta normalização — aqui é para o `alterado` acima não mentir.
        grau_relacao: (grau as GrauRelacao) || null,
        problemas,
        perda_inercia: moedaParaNumero(perda),
        // `status` congelou na migração 20260909000060 (é o caminho de volta):
        // nenhum caminho de escrita da aplicação pode tocar nele.
        fase,
        data_reuniao_preliminar: dataReuniao || null,
        perfil_disc: (disc as ClienteEtapa1["perfil_disc"]) || null,
        aderiu_reuniao: aderiu,
        mensagem_padrao_enviada: msgPadrao,
        estudo_caso_enviado: estudoCaso,
        ligacao_realizada: ligacao,
        registro_contato: registro.trim() || null,
        // Enviados sempre, inclusive fora de "contratado": o valor não some
        // ao mover o cliente de volta (B9-b). `null` continua `null` — nunca
        // vira R$ 0,00.
        valor_honorarios: honorariosValor,
        contrato_url: contratoLimpo || null,
      });
      if (res.erro) {
        toast.error("Erro ao salvar.");
        return;
      }
      toast.success("Ficha salva.");
    });
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {/* A fase sobe para o topo, como CHIP: o verde que existia era uma
            caixa de 300 px em volta do formulário do contrato — cor de estado
            aplicada à moldura, não ao estado. Agora o token semântico da fase
            (`FASES_CLIENTE.cor`, contraste medido) diz onde o cliente está,
            e a caixa colorida some. */}
        {faseAtual ? (
          <span
            className={
              "inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold " +
              faseAtual.cor
            }
            title={faseAtual.ajuda}
          >
            {faseAtual.rotulo}
          </span>
        ) : null}
        {mostraEstrela ? (
          <Button
            type="button"
            variant={acompanhado ? "default" : "outline"}
            size="sm"
            onClick={toggleEquipe}
            disabled={pending}
          >
            <Star className={"size-4 " + (acompanhado ? "fill-current" : "")} />
            {acompanhado
              ? "Cliente acompanhado pela equipe"
              : "Marcar como cliente da equipe"}
          </Button>
        ) : confirmado ? (
          // Somente leitura: a estrela vira SINAL, não botão. A explicação e o
          // caminho de saída ficam no aviso logo abaixo do cabeçalho.
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-sucesso-foreground/25 bg-sucesso px-3 text-xs font-semibold text-sucesso-foreground"
            title="Só a equipe troca o cliente acompanhado."
          >
            <Star className="size-4 fill-current" aria-hidden />
            Cliente acompanhado pela equipe
          </span>
        ) : null}
        {wpp ? (
          <a
            href={wpp}
            target="_blank"
            rel="noopener noreferrer"
            className="foco-visivel inline-flex items-center gap-1.5 rounded-md border border-sucesso-foreground/25 bg-sucesso px-3 py-1.5 text-sm font-medium text-sucesso-foreground transition hover:brightness-97"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : null}
      </div>

      {/* ── Acompanhamento pela equipe (§B.5 / migração ...203) ──────────────
          Ordem proposital: primeiro o que o ALUNO precisa saber (por que a
          estrela não se move), depois a porta da EQUIPE. Nada disto é
          formulário — a confirmação não passa por "Salvar ficha". */}
      {confirmado ? (
        <AvisoAcompanhamento
          confirmadoEm={cliente.acompanhamento_confirmado_em as string}
          admin={admin}
        />
      ) : outroConfirmadoNome != null ? (
        <AvisoOutroConfirmado nome={outroConfirmadoNome} admin={admin} />
      ) : null}

      {/* Sempre montado, mesmo vazio: região viva que nasce junto com o texto
          não é anunciada por parte dos leitores de tela. */}
      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erroEstrela}
      </p>

      {/* Só a equipe confirma/libera — e só quando este cliente É a estrela.
          Confirmar um que não é a estrela criaria um terceiro estado que
          nenhuma tela sabe mostrar (a RPC recusa, item 7 dos desvios).
          🔑 A condição lê `cliente.acompanhado_equipe` (dado do SERVIDOR), não
          o `acompanhado` otimista da tela: com o otimista, marcar a estrela
          faria o botão "Confirmar" aparecer antes de o banco ter a estrela, e
          o clique rápido cairia na recusa da RPC. Aqui ele aparece quando o
          dado volta — `definirClienteEquipe` já revalida esta rota. */}
      {admin && (cliente.acompanhado_equipe || confirmado) ? (
        <AcoesAcompanhamento
          cliente={cliente}
          alunoId={alunoId}
          aoMudar={() => router.refresh()}
        />
      ) : null}

      {/* TRÊS SEÇÕES, não três caixas aninhadas.
          A ficha era um formulário de 1.000 px dentro de um card só, com
          "Problemas" (borda cinza), "Andamento do contato" (borda cinza) e
          "Contrato" (fundo verde) como card-dentro-de-card-dentro-de-card —
          três tratamentos diferentes, um deles com uma cor sem explicação
          sistêmica. `Secao` é a MESMA cabeça de "Seu caminho" e "Meus
          clientes": marcador, título e régua. Sem `numero`: preencher a ficha
          não é uma sequência de passos. */}
      <Card>
        <CardContent className="grid gap-8">
        <Secao
          icone={<IdCard />}
          titulo="Dados do cliente"
          nivel="h3"
          classeConteudo="grid gap-5"
        >
          <div className="grid gap-2">
            <Label htmlFor="f-nome">Nome</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="f-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente"
                className="pl-9"
              />
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-tel">Telefone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="f-tel"
                  inputMode="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                  placeholder="(00) 00000-0000"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-nivel">Nível de relacionamento</Label>
              <Select value={nivel} onValueChange={(v) => setNivel(v ?? "")}>
                <SelectTrigger id="f-nivel">
                  <SelectValue placeholder="Selecione">
                    {(v: string) =>
                      NIVEIS_RELACIONAMENTO.find((n) => n.id === v)?.rotulo ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {NIVEIS_RELACIONAMENTO.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* GRAU DE RELAÇÃO — ao lado do nível, e não no lugar dele: nível é
              TEMPERATURA (frio/morno/quente), grau é TIPO DE VÍNCULO. Existe
              parente frio e lead quente; são dois eixos (§B.6). */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-grau">Grau de relação</Label>
              <Select value={grau} onValueChange={(v) => setGrau(v ?? "")}>
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

          {/* UX5 — grupo de checkboxes não tem um controle único para
              apontar: o rótulo vira legenda de um `fieldset`, que é a forma
              correta de nomear o conjunto (WCAG 1.3.1). */}
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">
              Problemas (marque ao menos um)
            </legend>
            <div className="grid gap-2 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2">
              {PROBLEMAS_7.map((p) => (
                <label
                  key={p.id}
                  className="flex items-start gap-2 text-sm leading-tight"
                >
                  <Checkbox
                    checked={problemas.includes(p.id)}
                    onCheckedChange={() => toggleProblema(p.id)}
                    className="mt-0.5"
                  />
                  <span>{p.rotulo}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="f-perda">Perda pela inércia</Label>
              <Input
                id="f-perda"
                inputMode="numeric"
                value={perda}
                onChange={(e) => setPerda(mascaraMoeda(e.target.value))}
                placeholder="R$ 0,00"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-fase">Fase</Label>
              <Select
                value={fase}
                onValueChange={(v) => setFase((v as FaseCliente) || "prospeccao")}
              >
                <SelectTrigger id="f-fase" aria-describedby="f-fase-ajuda">
                  {/* Sem função de render o Base UI imprime o VALOR do
                      banco: a ficha mostrava `quente`, `contratado` e `D`. */}
                  <SelectValue>
                    {(v: FaseCliente) =>
                      FASES_CLIENTE.find((f) => f.id === v)?.rotulo ?? v
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Cliente confirmado não oferece "Prospecção": o banco
                      recusa a volta com 42501. Opção que só serve para falhar
                      não é opção. */}
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
                {confirmado && cliente.fase !== "prospeccao"
                  ? " A equipe está acompanhando este cliente, então a fase não volta para Prospecção."
                  : null}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="f-data">Data da reunião preliminar</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="f-data"
                  type="date"
                  value={dataReuniao}
                  onChange={(e) => setDataReuniao(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

        </Secao>

        <Secao
          icone={<ListChecks />}
          titulo="Andamento do contato"
          nivel="h3"
        >
          <div className="grid gap-2 rounded-lg bg-superficie-afundada p-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={msgPadrao}
                  onCheckedChange={(v) => setMsgPadrao(Boolean(v))}
                />
                Mensagem padrão enviada
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={estudoCaso}
                  onCheckedChange={(v) => setEstudoCaso(Boolean(v))}
                />
                Estudo de caso enviado
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={ligacao}
                  onCheckedChange={(v) => setLigacao(Boolean(v))}
                />
                Ligação realizada
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={aderiu}
                  onCheckedChange={(v) => setAderiu(Boolean(v))}
                />
                Aderiu à reunião (grupo de WhatsApp)
              </label>
          </div>
        </Secao>

        <FichaContrato
          contratado={contratado}
          honorarios={honorarios}
          onHonorarios={setHonorarios}
          honorariosValor={honorariosValor}
          contratoUrl={contratoUrl}
          onContratoUrl={setContratoUrl}
          contratoLimpo={contratoLimpo}
          contratoInvalido={contratoInvalido}
          faseRotulo={faseAtual?.rotulo}
          metaFormatada={brlMeta}
        />

        <Secao icone={<NotebookPen />} titulo="Registro e perfil" nivel="h3" classeConteudo="grid gap-5">

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="f-disc">Perfil DISC</Label>
              <Select value={disc} onValueChange={(v) => setDisc(v ?? "")}>
                <SelectTrigger id="f-disc">
                  <SelectValue placeholder="—">
                    {(v: string) =>
                      PERFIS_DISC.find((d) => d.id === v)?.rotulo ?? v
                    }
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
          </div>

          <div className="grid gap-2">
            <Label htmlFor="f-reg">Registro do contato</Label>
            <Textarea
              id="f-reg"
              value={registro}
              onChange={(e) => setRegistro(e.target.value)}
              placeholder="Anotações sobre as conversas, ligações e combinados."
              rows={4}
            />
          </div>
        </Secao>
        </CardContent>
      </Card>

      {/* BARRA DE SALVAR FIXA. `sticky bottom-0` fora do `Card` — o `Card` é
          `overflow-hidden` e recortaria qualquer coisa grudada nele. O aviso
          de alteração não salva é `aria-live="polite"`: quem não vê a barra
          precisa ouvir que há algo pendente antes de sair da tela. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-card/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-(--shadow-raised)">
        <p aria-live="polite" className="mr-auto corpo-sm text-muted-foreground">
          {alterado
            ? "Você tem alterações não salvas nesta ficha."
            : "Tudo salvo."}
        </p>
        {/* O botão NUNCA é desabilitado por `alterado`: se a comparação
            errar por um campo, o aluno fica preso sem conseguir salvar a
            ficha. O sinal é informativo; salvar de novo é inofensivo. */}
        <Button onClick={salvar} disabled={pending}>
          {pending ? "Salvando..." : "Salvar ficha"}
        </Button>
      </div>

      {/* PL11 — o botão da estrela continua montado acima: é para lá que o
          foco volta quando o aluno desiste. O nome vem do campo em edição,
          que é o que ele está lendo na tela. */}
      {desfavoritando ? (
        <DialogoDesfavoritar
          desfavoritando={{ ...cliente, nome: nome.trim() || cliente.nome }}
          pending={pending}
          erroDialogo={erroDialogo}
          onConfirmar={() => aplicarEquipe(false)}
          onCancelar={() => {
            setDesfavoritando(false);
            setErroDialogo(null);
          }}
        />
      ) : null}
    </div>
  );
}
