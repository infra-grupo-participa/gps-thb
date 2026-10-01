// Reconciliação inicial: eventos criados à mão (Aldri) na agenda IMPLEMENTAÇÃO
// × sessões do GPS. Decisão do dono: evento manual tem prioridade — adotar,
// nunca duplicar.
//
// Uso (Node 24 roda .ts direto):
//   node scripts/gcal-reconciliar.ts                 → ENSAIO, só leitura
//   node scripts/gcal-reconciliar.ts --aplicar       → adota SÓ os pares exatos
//   node scripts/gcal-reconciliar.ts --dias=30       → janela (padrão 60, máx 120)
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GCAL_CLIENT_ID,
//      GCAL_CLIENT_SECRET, GCAL_REFRESH_TOKEN, GCAL_CALENDAR_ID.
//
// 🔴 --aplicar só chama gps.gcal_espelho_adotar quando o par é ÚNICO e o
// horário é IDÊNTICO. Par com horário diferente: remarcar a sessão para o
// horário da Aldri pela tela /admin/sessoes (RPC da 327, que avisa o aluno);
// o script só lista.
//
// Não importa supabase/functions/_shared/gcal.ts: aquele arquivo usa
// parameter properties (`readonly tipo` no construtor), que o Node não sabe
// remover ao rodar .ts. Duplica só o mínimo: troca de token + listagem.

type Evento = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

type Sessao = {
  origem_id: string;
  tipo_etapa: number;
  tipo_nome: string;
  estado: string;
  inicio_em: string;
  fim_em: string;
  aluno_nome: string | null;
  cliente_nome: string | null;
  responsavel_email: string | null;
  google_event_id: string | null;
  modo: string | null;
};

const TZ = "America/Sao_Paulo";

function env(nome: string): string {
  const v = process.env[nome];
  if (!v) throw new Error(`variável de ambiente ausente: ${nome}`);
  return v;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Etapa do evento pelo título. "Pré Reunião Preliminar + Reunião Preliminar"
// é SÓ a EP (decisão do dono).
function etapaDoTitulo(titulo: string): 1 | 2 | null {
  const t = normalizar(titulo);
  if (t.includes("entrevista previa")) return 1;
  if (t.includes("pre reuniao preliminar")) return 1;
  if (t.includes("reuniao preliminar")) return 2;
  return null;
}

// "<prefixo> - <Nome> - Implementação" → "<Nome>". Sem o padrão, título inteiro.
function nomeDoTitulo(titulo: string): string {
  const partes = titulo.split(/\s+[-–—]\s+/);
  if (partes.length >= 3) return normalizar(partes.slice(1, -1).join(" "));
  if (partes.length === 2) return normalizar(partes[1]);
  return normalizar(titulo);
}

function diaLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

function horaLocal(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Casa nome se todos os tokens (>=3 letras) do mais curto estão no mais longo.
function nomeCasa(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ta = a.split(" ").filter((x) => x.length >= 3);
  const tb = b.split(" ").filter((x) => x.length >= 3);
  if (ta.length === 0 || tb.length === 0) return false;
  const [curto, longo] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return curto.every((x) => longo.has(x));
}

async function tokenGoogle(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GCAL_CLIENT_ID"),
      client_secret: env("GCAL_CLIENT_SECRET"),
      refresh_token: env("GCAL_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`token Google: HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("token Google: resposta sem access_token");
  return j.access_token;
}

async function listarEventos(token: string, de: Date, ate: Date): Promise<Evento[]> {
  const cal = encodeURIComponent(env("GCAL_CALENDAR_ID"));
  const todos: Evento[] = [];
  let pagina: string | undefined;
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({
      timeMin: de.toISOString(),
      timeMax: ate.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pagina) q.set("pageToken", pagina);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${cal}/events?${q.toString()}`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) throw new Error(`listar eventos: HTTP ${res.status}`);
    const j = (await res.json()) as { items?: Evento[]; nextPageToken?: string };
    todos.push(...(j.items ?? []));
    pagina = j.nextPageToken;
    if (!pagina) break;
  }
  return todos;
}

async function rpc<T>(nome: string, corpo: Record<string, unknown>): Promise<T> {
  const chave = env("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      "Content-Profile": "gps",
      "Accept-Profile": "gps",
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    let msg = "";
    try {
      msg = String(((await res.json()) as { message?: string }).message ?? "").slice(0, 160);
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(`rpc ${nome}: HTTP ${res.status} ${msg}`.trim());
  }
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  const aplicar = process.argv.includes("--aplicar");
  const argDias = process.argv.find((a) => a.startsWith("--dias="));
  const dias = Math.min(Math.max(Number(argDias?.slice(7) ?? 60) || 60, 1), 120);

  const de = new Date();
  const ate = new Date(de.getTime() + dias * 86400000);

  const [token, sessoes] = await Promise.all([
    tokenGoogle(),
    rpc<Sessao[]>("gcal_espelho_agenda", { p_de: de.toISOString(), p_ate: ate.toISOString() }),
  ]);
  const eventos = await listarEventos(token, de, ate);

  const manuais = eventos.filter(
    (e) => e.status !== "cancelled" && !e.extendedProperties?.private?.gps_origem && e.start?.dateTime,
  );

  type Linha = {
    evento: Evento;
    etapa: 1 | 2 | null;
    pares: Sessao[];
  };
  const linhas: Linha[] = manuais.map((ev) => {
    const titulo = ev.summary ?? "";
    const etapa = etapaDoTitulo(titulo);
    const nome = nomeDoTitulo(titulo);
    const dia = diaLocal(ev.start!.dateTime!);
    const pares =
      etapa === null
        ? []
        : sessoes.filter(
            (s) =>
              s.tipo_etapa === etapa &&
              diaLocal(s.inicio_em) === dia &&
              (nomeCasa(nome, normalizar(s.aluno_nome ?? "")) ||
                nomeCasa(nome, normalizar(s.cliente_nome ?? ""))),
          );
    return { evento: ev, etapa, pares };
  });

  const usadas = new Set<string>();
  let exatos = 0;
  let divergentes = 0;
  let semPar = 0;
  let ambiguos = 0;
  let adotados = 0;
  let falhas = 0;

  console.log(`Janela: ${dias} dias · eventos manuais: ${manuais.length} · sessões vivas: ${sessoes.length}`);
  console.log(`Modo: ${aplicar ? "APLICAR (só pares exatos)" : "ENSAIO (só leitura)"}\n`);
  console.log(["evento", "título", "início evento", "sessão", "início sessão", "dif (min)", "ação"].join(" | "));

  for (const l of linhas) {
    const ev = l.evento;
    const titulo = (ev.summary ?? "").slice(0, 60);
    const iniEv = ev.start!.dateTime!;
    if (l.etapa === null) continue; // não é EP/RP
    if (l.pares.length === 0) {
      semPar++;
      console.log([ev.id.slice(0, 10), titulo, horaLocal(iniEv), "-", "-", "-", "SEM PAR"].join(" | "));
      continue;
    }
    if (l.pares.length > 1) {
      ambiguos++;
      console.log(
        [ev.id.slice(0, 10), titulo, horaLocal(iniEv), l.pares.map((p) => p.origem_id.slice(0, 8)).join(","), "-", "-", "AMBÍGUO"].join(" | "),
      );
      continue;
    }
    const s = l.pares[0];
    usadas.add(s.origem_id);
    const dif = Math.round((new Date(iniEv).getTime() - new Date(s.inicio_em).getTime()) / 60000);
    let acao: string;
    if (s.google_event_id && s.google_event_id !== ev.id) {
      acao = "JÁ VINCULADA A OUTRO EVENTO";
    } else if (dif !== 0) {
      divergentes++;
      acao = "ADOTAR + AJUSTAR HORÁRIO (BLOQUEADO: sem remarcação com aviso)";
    } else {
      exatos++;
      acao = "ADOTAR";
      if (aplicar && s.google_event_id !== ev.id) {
        try {
          await rpc("gcal_espelho_adotar", { p_origem_id: s.origem_id, p_google_event_id: ev.id });
          adotados++;
          acao = "ADOTADO";
        } catch (e) {
          falhas++;
          acao = `FALHOU: ${e instanceof Error ? e.message : "erro"}`;
        }
      }
    }
    console.log(
      [ev.id.slice(0, 10), titulo, horaLocal(iniEv), s.origem_id.slice(0, 8), horaLocal(s.inicio_em), String(dif), acao].join(" | "),
    );
  }

  const semEvento = sessoes.filter((s) => !usadas.has(s.origem_id) && !s.google_event_id);
  console.log(`\nSessões sem evento (a edge CRIARÁ ao ligar): ${semEvento.length}`);
  for (const s of semEvento) {
    console.log(`  ${s.origem_id.slice(0, 8)} | ${s.tipo_nome} | ${horaLocal(s.inicio_em)} | ${s.aluno_nome ?? "?"}`);
  }

  console.log(
    `\nResumo: exatos=${exatos} divergentes=${divergentes} sem_par=${semPar} ambíguos=${ambiguos} adotados=${adotados} falhas=${falhas}`,
  );
  if (falhas > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "erro");
  process.exitCode = 1;
});

export {};
