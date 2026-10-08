// Existe build:* com flag que o `build` não tem: o deploy usa qual?
export default function checar({ ler }) {
  const pkg = ler("package.json");
  if (!pkg) return [];
  let scripts;
  try { scripts = JSON.parse(pkg).scripts || {}; } catch { return []; }
  const build = scripts.build || "";
  const achados = [];
  for (const [nome, cmd] of Object.entries(scripts)) {
    if (!nome.startsWith("build:")) continue;
    const flags = (cmd.match(/--[\w-]+/g) || []).filter((f) => !build.includes(f));
    if (/next\s+build/.test(cmd) && flags.length) {
      achados.push({
        arquivo: "package.json", linha: 1,
        msg: `"${nome}" usa ${flags.join(" ")} e "build" não — confirmar que a config SALVA do deploy roda "${nome}", ou mover o contorno para "build"`,
      });
    }
  }
  return achados;
}
