/* D&M: servidor das notificações (Cloudflare Worker, grátis) */
const PROJETO = "d-e-m-db466";
const API_KEY = "AIzaSyCJfh8vBafbuDSa4f1coZNHWQgRUJfgvgc";
const APP_URL = "https://miihzteir.github.io/D-M/";
const INICIO = "2026-12-25";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJETO}/databases/(default)/documents`;

const outro = q => (q === "Di" ? "Mihzinha" : "Di");
const Ele = q => (q === "Di" ? "O Di" : "A Mihzinha");
const ele = q => (q === "Di" ? "ele" : "ela");
const corta = (t, n = 90) => (!t ? "" : t.length > n ? t.slice(0, n - 1) + "…" : t);
function agoraEm(tz) {
  let p;
  try { p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date()); }
  catch (e) { p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(new Date()); }
  const o = Object.fromEntries(p.map(x => [x.type, x.value]));
  return { dia: `${o.year}-${o.month}-${o.day}`, hora: Number(o.hour) % 24 };
}
const jaComecou = () => agoraEm("America/Cuiaba").dia >= INICIO;

/* ---- login do Google com a chave do Firebase ---- */
let tokenCache = { t: "", ate: 0 };
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlTxt = s => b64url(new TextEncoder().encode(s));
async function acesso(env) {
  if (tokenCache.t && Date.now() < tokenCache.ate) return tokenCache.t;
  const sa = JSON.parse(env.SA);
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const agora = Math.floor(Date.now() / 1000);
  const corpo = b64urlTxt(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64urlTxt(JSON.stringify({
    iss: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore"
  }));
  const ass = b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(corpo)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + corpo + "." + ass });
  const j = await r.json();
  if (!j.access_token) throw new Error("login google: " + JSON.stringify(j).slice(0, 200));
  tokenCache = { t: j.access_token, ate: Date.now() + 50 * 60 * 1000 };
  return j.access_token;
}
const fsGet = async (env, path) => { const r = await fetch(`${FS}/${path}`, { headers: { authorization: "Bearer " + await acesso(env) } }); return r.ok ? r.json() : null; };
const val = (doc, k) => { const f = doc && doc.fields && doc.fields[k]; return f ? (f.stringValue ?? f.integerValue ?? f.doubleValue ?? f.booleanValue ?? null) : null; };

async function tokensDe(env, quem) {
  const r = await fetch(`${FS}:runQuery`, { method: "POST", headers: { authorization: "Bearer " + await acesso(env), "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "tokens" }], where: { fieldFilter: { field: { fieldPath: "quem" }, op: "EQUAL", value: { stringValue: quem } } } } }) });
  const l = r.ok ? await r.json() : [];
  return l.filter(x => x.document).map(x => ({ nome: x.document.name, token: val(x.document, "token"), tz: val(x.document, "tz") })).filter(x => x.token);
}
async function enviar(env, para, titulo, corpo, go, tag) {
  if (!para) return 0;
  const tks = await tokensDe(env, para), at = await acesso(env);
  let n = 0;
  for (const t of tks) {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJETO}/messages:send`, { method: "POST", headers: { authorization: "Bearer " + at, "content-type": "application/json" },
      body: JSON.stringify({ message: { token: t.token, notification: { title: titulo, body: corpo || "" }, data: { go: go || "" },
        webpush: { headers: { Urgency: "high", TTL: "86400" }, notification: { icon: APP_URL + "icon-192.png", badge: APP_URL + "icon-badge.png", tag: tag || go || "dm", renotify: true, vibrate: [120, 60, 120] }, fcm_options: { link: APP_URL + (go ? "#ir-" + go : "") } } } }) });
    if (r.ok) n++;
    else if (r.status === 404 || r.status === 400) await fetch(`https://firestore.googleapis.com/v1/${t.nome}`, { method: "DELETE", headers: { authorization: "Bearer " + at } });
  }
  return n;
}

/* ---- o que cada coisa vira de aviso ---- */
function mensagem(col, d, a, quem) {
  const de = quem;
  switch (col) {
    case "bilhetes": return d.autor === de && [outro(de), `${Ele(de)} colou um bilhetinho pra você`, d.texto ? corta(d.texto) : "Tem um áudio novo", "bilhetes"];
    case "respostas": return d.quem === de && !a && [outro(de), `${Ele(de)} respondeu a pergunta de hoje`, `Vem ver o que ${ele(de)} disse`, "pergunta"];
    case "abraQuando": return d.autor === de && !a && [outro(de), `${Ele(de)} escreveu uma carta nova pra você`, "Tem envelope novo no Abra quando…", "abra"];
    case "cartasData": return d.de === de && !a && [outro(de), `${Ele(de)} lacrou uma cartinha pra você`, d.abreEm ? `Ela abre em ${String(d.abreEm).split("-").reverse().join("/")}` : "", "cartadata"];
    case "abracos": return d.de === de && d.para && d.para !== de && [d.para, `${Ele(de)} te deu um abraço`, "Lá na nossa casinha ♥", "casinha", "abraco"];
    case "missoesEsp": return d.autor === de && !a && [outro(de), `${Ele(de)} criou uma missão especial pra você`, corta(d.t), ""];
    case "gostos": return d.autor === de && !a && d.sobre === outro(de) && [outro(de), `${Ele(de)} colocou uma coisa que você ama`, corta(d.legenda), "gostos"];
    case "musicas": return d.autor === de && !a && [outro(de), `${Ele(de)} colocou uma música na nossa playlist`, "", "playlist"];
    case "saudade": return d.quem === de && (d.n || 1) > ((a && a.n) || 0) && [outro(de), `${Ele(de)} tá com saudade de você`, `${d.n || 1}x hoje no termômetro`, "saudade", "saudade"];
    case "pensei": return [outro(de), `${Ele(de)} pensou em você ♥`, `${d.n || 1}x hoje`, "", "pensei"];
    case "premios":
      if (!a && d.autor === de && !d.comprado) return [outro(de), `${Ele(de)} ofereceu um prêmio pra você`, corta(d.t), "premios"];
      if (a && !a.comprado && d.comprado && d.por === de) return [outro(de), `${Ele(de)} trocou chocolates por um prêmio`, `${corta(d.t)}. Hora de cumprir ♥`, "premios"];
      if (a && !a.entregue && d.entregue && d.autor === de) return [outro(de), `${Ele(de)} cumpriu o seu prêmio`, corta(d.t), "premios"];
      return null;
  }
  return null;
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
const resp = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method !== "POST") return resp({ ok: true, oi: "D&M avisos funcionando ♥" });
    try {
      const b = await req.json();
      const u = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: b.idToken }) })).json();
      const uid = u.users && u.users[0] && u.users[0].localId;
      if (!uid) return resp({ erro: "login" }, 401);
      const quem = val(await fsGet(env, "pessoas/" + uid), "quem");
      if (quem !== "Di" && quem !== "Mihzinha") return resp({ erro: "pessoa" }, 403);
      if (b.col === "teste") return resp({ ok: true, enviados: await enviar(env, quem, "D&M", "Notificação de teste: com o app fechado também chega ♥", "", "teste") });
      if (!jaComecou()) return resp({ ok: true, cedo: true });
      const m = mensagem(b.col, b.doc || {}, b.antes || null, quem);
      if (!m) return resp({ ok: true, nada: true });
      return resp({ ok: true, enviados: await enviar(env, ...m) });
    } catch (e) { return resp({ erro: String(e && e.message || e).slice(0, 200) }, 500); }
  },
  /* toda hora: se já são 21h no celular da pessoa e ela não entrou hoje, lembra */
  async scheduled(ev, env, ctx) {
    if (!jaComecou()) return;
    for (const q of ["Di", "Mihzinha"]) {
      const p = await fsGet(env, "presenca/" + q);
      const tks = await tokensDe(env, q); if (!tks.length) continue;
      const tz = val(p, "tz") || tks[0].tz || "America/Cuiaba";
      const { dia, hora } = agoraEm(tz);
      if (hora !== 21 || val(p, "dia") === dia || val(p, "lembrado") === dia) continue;
      await enviar(env, q, "Você ainda não passou aqui hoje", `${Ele(outro(q))} tá te esperando no nosso cantinho ♥`, "", "lembrete");
      await fetch(`${FS}/presenca/${q}?updateMask.fieldPaths=lembrado`, { method: "PATCH", headers: { authorization: "Bearer " + await acesso(env), "content-type": "application/json" }, body: JSON.stringify({ fields: { lembrado: { stringValue: dia } } }) });
    }
  }
};
