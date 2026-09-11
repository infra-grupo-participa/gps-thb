import { cookies } from "next/headers";
import { MessageCircle } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getTurmaCodigo } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { linkWhatsapp } from "@/lib/whatsapp";

/**
 * Botão flutuante "Falar com a secretaria" (11/09/2026, pedido do Marcio).
 *
 * 🔑 **Botão fixo, não pop-up que interrompe** (decisão dele): fica no canto,
 * em desktop e celular, e não rouba a tela de quem está trabalhando. Quem
 * fecha um pop-up uma vez não o acha depois.
 *
 * O número vive em `gps.config.whatsapp_secretaria` e é lido pela RPC
 * `gps.whatsapp_secretaria()` — a tabela inteira é só-admin (guarda
 * `resend_api_key`), então uma função que devolve SÓ este valor é o mesmo
 * molde de `chamados_abertos()` e `convite_socio_ativo()`. A equipe troca o
 * número pelo painel, sem deploy.
 *
 * **Falha fechado:** sem número configurado, o botão não aparece — melhor
 * ausente do que abrindo uma conversa vazia.
 *
 * ⚠️ NÃO montar em `/p/*` (o Plantão é do Acelera e tem a monitoria própria)
 * nem nas telas de admin — quem trabalha no painel fala com a secretaria por
 * outros canais. Ver `src/app/layout.tsx`.
 */
export async function BotaoSecretaria() {
  // Guarda 1 — sem cookie de sessão nem toca no banco. É o mesmo primeiro
  // passo do `OnboardingGate`: o layout raiz também serve /login, /convite e
  // /p/plantao, e uma ida ao GoTrue em cada uma delas custa ~390 ms.
  const jar = await cookies();
  const temSessao = jar
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (!temSessao) return null;

  // Guarda 2 — só o PARCEIRO. A equipe fala com a secretaria por outros
  // canais, e um botão de suporte na tela de quem DÁ suporte é ruído.
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("whatsapp_secretaria");
  if (error || typeof data !== "string" || !data) return null;

  // A secretaria precisa saber QUEM está falando sem perguntar. Só busca o
  // nome DEPOIS de confirmar que há número configurado — sem número não há
  // botão, e a consulta seria desperdício.
  const aluno = await getAlunoById(ctx.alunoId);
  const turma = await getTurmaCodigo(aluno?.turma_id);
  const quem = [aluno?.nome?.trim(), turma ? `turma ${turma}` : null]
    .filter(Boolean)
    .join(", ");
  const href = linkWhatsapp(
    data,
    quem
      ? `Olá! Aqui é ${quem}, do Programa de Implementação Assistida.`
      : "Olá! Sou do Programa de Implementação Assistida.",
  );
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      // `print:hidden` porque o botão não faz sentido no papel; `z-40` fica
      // ABAIXO dos diálogos (z-50), senão flutuaria por cima do modal aberto.
      // `--color-marca-acao` (#C74600) é o preenchimento AA do botão
      // primário. `bg-sucesso` seria errado aqui: é o fundo CLARO do par
      // semântico (#e8f5ec), pensado para chip, não para botão sólido.
      className="foco-visivel fixed right-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-marca-acao px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:brightness-110 print:hidden"
    >
      <MessageCircle aria-hidden className="size-5 shrink-0" />
      {/* No celular o rótulo sai e sobra o ícone: a barra inferior é estreita
          e um botão largo cobriria o conteúdo. O `sr-only` mantém o nome
          acessível nos dois tamanhos. */}
      <span className="hidden sm:inline">Falar com a secretaria</span>
      <span className="sr-only sm:hidden">Falar com a secretaria</span>
    </a>
  );
}
