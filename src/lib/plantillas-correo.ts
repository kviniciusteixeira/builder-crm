import { marca, textoSobre } from "@/lib/config";

/**
 * Os dois templates de e-mail de acesso, com a marca da instância.
 *
 * Serve-os `/correo/[plantilla].html` e os lê o servidor de autenticação, que é
 * quem envia o e-mail: em `GOTRUE_MAILER_TEMPLATES_*` se põe essa URL e o GoTrue a
 * baixa, substitui os marcadores e envia. Se a URL não responde, o GoTrue usa o
 * template padrão (em inglês): vê-se pior, mas o e-mail sai igual.
 *
 * No Supabase cloud os templates se colam à mão no painel (Auth -> Emails). A
 * mesma URL serve para isso: abre-se, copia-se o HTML e cola-se.
 *
 * Os marcadores com chaves duplas os substitui o GoTrue, não o React: `ConfirmationURL` é
 * o link de uso único e `Email` o destinatário. Não adicionar outros marcadores sem
 * conferir que o GoTrue os defina para esse tipo de e-mail; um inexistente se imprime como
 * texto estranho no e-mail.
 *
 * Escreve-se em HTML de e-mail de propósito (tabelas, estilos inline, sem CSS externo nem
 * variáveis): é o único que renderizam igual Gmail, Outlook e Apple Mail.
 */

export const PLANTILLAS = ["invitacion", "recuperacion"] as const;
export type TipoPlantilla = (typeof PLANTILLAS)[number];

export function esPlantilla(valor: string): valor is TipoPlantilla {
  return (PLANTILLAS as readonly string[]).includes(valor);
}

interface Texto {
  titulo: (marca: string) => string;
  entrada: string;
  boton: string;
  nota: string;
}

const TEXTOS: Record<TipoPlantilla, Texto> = {
  invitacion: {
    titulo: (m) => `Te sumaron a ${m}`,
    entrada:
      "Ya tenes tu lugar en el equipo. Solo falta que elijas una contrasena para entrar.",
    boton: "Elegir mi contrasena",
    nota: "Si no esperabas esta invitacion, podes ignorar este correo: sin definir la contrasena, la cuenta no se usa.",
  },
  recuperacion: {
    titulo: (m) => `Volver a entrar a ${m}`,
    entrada:
      "Pediste recuperar el acceso. Este enlace te deja elegir una contrasena nueva.",
    boton: "Elegir una contrasena nueva",
    nota: "Si no pediste esto, ignora el correo: tu contrasena actual sigue funcionando y nadie entro.",
  },
};

/** HTML do template. `base` é a URL pública da instância (para o logo). */
export function plantillaCorreo(tipo: TipoPlantilla, base: string | null): string {
  const m = marca();
  const t = TEXTOS[tipo];
  const sobrePrimario = textoSobre(m.colorPrimario);
  const logo = base ? `${base}${m.logo}` : null;

  const cabecera = logo
    ? `<img src="${logo}" width="44" height="44" alt="" style="display:block;border:0;border-radius:50%;margin:0 auto 14px" />`
    : "";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapar(t.titulo(m.nombre))}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapar(t.entrada)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f5f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.08);">
<tr><td style="height:4px;background:${m.colorPrimario};line-height:4px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 32px 8px;text-align:center;">
${cabecera}
<h1 style="margin:0;font-size:20px;line-height:1.3;color:#101828;font-weight:600;">${escapar(t.titulo(m.nombre))}</h1>
</td></tr>
<tr><td style="padding:12px 32px 0;">
<p style="margin:0;font-size:15px;line-height:1.6;color:#475467;">${escapar(t.entrada)}</p>
</td></tr>
<tr><td style="padding:24px 32px 8px;" align="center">
<a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:${m.colorPrimario};color:${sobrePrimario};font-size:15px;font-weight:600;text-decoration:none;">${escapar(t.boton)}</a>
</td></tr>
<tr><td style="padding:8px 32px 0;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#98a2b3;">Si el boton no funciona, copia este enlace en el navegador:<br /><a href="{{ .ConfirmationURL }}" style="color:#667085;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
</td></tr>
<tr><td style="padding:20px 32px 28px;">
<p style="margin:0;font-size:12px;line-height:1.6;color:#98a2b3;">${escapar(t.nota)} El enlace sirve una sola vez y vence en 24 horas.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#98a2b3;">${escapar(m.nombre)} &middot; enviado a {{ .Email }}</p>
</td></tr>
</table>
</body>
</html>
`;
}

/** A marca a escreve o membro em config/cliente.ts, não um desconhecido, mas isto
 *  vai escapado igual: um `&` ou um `<` no nome não deve quebrar o e-mail. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
