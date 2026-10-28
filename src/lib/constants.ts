import type { LeadSource, ActivityType } from "@/types";
import { getConfig } from "@/lib/config";

export const SOURCE_LABELS: Record<LeadSource, string> = {
  website: "Sitio web",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  referido: "Referido",
  redes_sociales: "Redes sociales",
  llamada_fria: "Llamada fria",
  email: "Email",
  formulario: "Formulario",
  evento: "Evento",
  import: "Importado",
  webhook: "Webhook",
  gohighlevel: "GoHighLevel",
  simulador: "Simulador",
  otro: "Otro",
};

export const ACTIVITY_TYPE_CONFIG: Record<
  ActivityType,
  { label: string; icon: string }
> = {
  call: { label: "Llamada", icon: "Phone" },
  email: { label: "Email", icon: "Mail" },
  meeting: { label: "Reunion", icon: "Users" },
  note: { label: "Nota", icon: "FileText" },
  follow_up: { label: "Seguimiento", icon: "Clock" },
};

/** Valores em centavos; a moeda sai de config/cliente.ts (`moneda`). */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: getConfig().moneda,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function cleanPhoneForWhatsApp(phone: string): string {
  // "+52 55 1234 5678" → "525512345678"
  return phone.replace(/[\s\-\(\)]/g, "").replace(/^\+/, "");
}

function toDate(date: Date | number): Date {
  if (date instanceof Date) return date;
  // If number is less than 1e12, it's in seconds; otherwise milliseconds
  return new Date(date < 1e12 ? date * 1000 : date);
}

export function formatDate(date: Date | number | null): string {
  if (!date) return "-";
  const d = toDate(date);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: getConfig().zonaHoraria,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Dia de calendário no fuso da instância, como "2026-10-12". */
function diaLocal(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: getConfig().zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

export function formatRelativeDate(date: Date | number): string {
  const d = toDate(date);
  // "Hoy" e "Ayer" são dias do calendário, não janelas de 24 h: às 00:30 algo das
  // 23:00 é de ontem mesmo que tenham passado 90 minutos. Comparam-se os dias no fuso da
  // instância para que a mesma linha não diga uma coisa no servidor e outra no
  // navegador.
  const dias = Math.round(
    (Date.parse(`${diaLocal(new Date())}T00:00:00Z`) - Date.parse(`${diaLocal(d)}T00:00:00Z`)) /
      86_400_000
  );

  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} dias`;
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} semanas`;
  return formatDate(date);
}
