import { z } from "zod";

/**
 * Esquema da configuração por cliente (`config/cliente.ts`).
 *
 * Este arquivo NÃO importa nada server-only de propósito: os componentes cliente
 * (sidebar, formulários) leem a marca e os campos diretamente. Aqui não vai nenhuma
 * credencial; isso é ambiente (.env), não configuração.
 */

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{6})$/, "Color en formato #rrggbb");

const clave = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_]*$/, "Clave en snake_case, empieza con letra (ej. tipo_operacion)");

/**
 * Fuso horário IANA. Valida-se contra o próprio ambiente (`Intl` existe igual no Node e
 * no navegador) porque um fuso mal escrito não falha sozinho: o `Intl` o rejeita ao
 * formatar e o erro aparece longe daqui, ou pior, alguém o captura e a data sai
 * em UTC sem que ninguém perceba.
 */
const zonaIana = z
  .string()
  .min(1)
  .superRefine((valor, ctx) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: valor });
    } catch {
      ctx.addIssue({
        code: "custom",
        message: `zona horaria desconocida: "${valor}". Va un identificador IANA, como America/Santiago, America/Mexico_City o Europe/Madrid`,
      });
    }
  });

export const esquemaMarca = z.object({
  /** Nome completo: aba, login, sidebar, X-Title do agente. */
  nombre: z.string().min(1).max(60),
  /** Nome curto para o ícone da PWA e as notificações (máx. 12). */
  nombreCorto: z.string().min(1).max(12),
  /** Uma frase: aparece no login e na descrição da PWA. */
  descripcion: z.string().max(200).default("CRM multicanal con agente de IA."),
  /** Rotas públicas (dentro de public/marca/). */
  logo: z.string().min(1).default("/marca/logo.png"),
  icono: z.string().min(1).default("/marca/icono.png"),
  /** Cor dos botões e ações primárias. */
  colorPrimario: hex.default("#2E4A47"),
  /** Cor de fundo da sidebar e da barra do telefone (theme_color). */
  colorSidebar: hex.default("#0F1419"),
});

export const esquemaEtapa = z.object({
  clave: clave,
  nombre: z.string().min(1).max(60),
  color: hex.default("#64748b"),
  ganada: z.boolean().default(false),
  perdida: z.boolean().default(false),
});

export const esquemaPipeline = z.object({
  nombre: z.string().min(1).max(60).default("Ventas"),
  etapas: z
    .array(esquemaEtapa)
    .min(2, "Un pipeline necesita al menos dos etapas")
    .refine(
      (e) => new Set(e.map((x) => x.clave)).size === e.length,
      "Hay etapas con la misma clave"
    ),
});

export const TIPOS_CAMPO = ["texto", "numero", "seleccion", "booleano", "fecha"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

export const esquemaCampo = z
  .object({
    clave: clave,
    etiqueta: z.string().min(1).max(60),
    tipo: z.enum(TIPOS_CAMPO),
    /** Só para o tipo `seleccion`. */
    opciones: z.array(z.string().min(1)).optional(),
    requerido: z.boolean().default(false),
    /** Mostrar como coluna na tabela de contatos. */
    enTabla: z.boolean().default(false),
    /** Texto de ajuda no formulário. */
    ayuda: z.string().max(200).optional(),
    /**
     * Se o agente de IA deve descobrir este dado na conversa. A descrição
     * diz ao modelo o que perguntar ("orçamento máximo em dólares").
     */
    agente: z
      .object({
        calificar: z.boolean().default(true),
        descripcion: z.string().max(300).optional(),
      })
      .optional(),
  })
  .refine(
    (c) => c.tipo !== "seleccion" || (c.opciones && c.opciones.length > 0),
    "Un campo de tipo seleccion necesita opciones"
  );

export const esquemaAgente = z.object({
  /** Como o agente se apresenta na conversa. */
  nombre: z.string().max(40).default("Asistente"),
  /** Prompt base. Se faltar, usa-se o default do núcleo (src/lib/agent/prompt.ts). */
  prompt: z.string().optional(),
  /** Modelo do OpenRouter. AGENT_MODEL (ambiente) manda sobre este valor. */
  modelo: z.string().optional(),
  /** O que se diz ao cliente quando o agente transfere para uma pessoa. */
  mensajeDerivacion: z
    .string()
    .min(1)
    .max(500)
    .default("Te paso con una persona del equipo que te va a ayudar con esto. Un momento."),
});

export const esquemaModulosNucleo = z.object({
  automatizaciones: z.boolean().default(true),
  actividades: z.boolean().default(true),
  plantillas: z.boolean().default(true),
  push: z.boolean().default(true),
  reportes: z.boolean().default(true),
  /** Simulador de conversas (só admin). */
  simulador: z.boolean().default(true),
});

export const esquemaConfig = z.object({
  marca: esquemaMarca,
  idioma: z.enum(["es", "en"]).default("es"),
  /** Código ISO 4217 para formatar valores. */
  moneda: z.string().length(3).default("USD"),
  /**
   * Fuso horário do negócio: com que fuso se resolve o dia e a hora, na tela e
   * no prompt do agente. O processo roda em UTC de propósito (uma imagem compartilhada
   * por muitas instâncias não pode trazer o fuso gravado nela), então sem isto o agente
   * nomeia o dia errado de noite. Ver `specs/nucleo/11-fuso-horario.md`.
   *
   * O default é UTC para não mover as datas de uma instância já implantada que
   * atualize o núcleo sem tocar na sua configuração.
   */
  zonaHoraria: zonaIana.default("UTC"),
  roles: z
    .object({
      /** Como se chama o papel `asesor` na tela (Asesor, Agente, Vendedor...). */
      etiquetaAsesor: z.string().min(1).max(30).default("Asesor"),
    })
    .default({ etiquetaAsesor: "Asesor" }),
  pipeline: esquemaPipeline,
  contacto: z
    .object({
      campos: z
        .array(esquemaCampo)
        .default([])
        .refine(
          (c) => new Set(c.map((x) => x.clave)).size === c.length,
          "Hay campos con la misma clave"
        ),
    })
    .default({ campos: [] }),
  agente: esquemaAgente.default({
    nombre: "Asistente",
    mensajeDerivacion: "Te paso con una persona del equipo que te va a ayudar con esto. Un momento.",
  }),
  /** Funções do núcleo que se podem desligar + módulos de `modules/` pelo nome da pasta. */
  modulos: z
    .object({
      nucleo: esquemaModulosNucleo.default({
        automatizaciones: true,
        actividades: true,
        plantillas: true,
        push: true,
        reportes: true,
        simulador: true,
      }),
      /** Nomes de pastas dentro de modules/ que estão ativas. */
      activos: z.array(clave).default([]),
    })
    .default({
      nucleo: {
        automatizaciones: true,
        actividades: true,
        plantillas: true,
        push: true,
        reportes: true,
        simulador: true,
      },
      activos: [],
    }),
});

export type ConfigCliente = z.infer<typeof esquemaConfig>;
export type ConfigClienteEntrada = z.input<typeof esquemaConfig>;
export type Marca = z.infer<typeof esquemaMarca>;
export type EtapaConfig = z.infer<typeof esquemaEtapa>;
export type CampoConfig = z.infer<typeof esquemaCampo>;

/**
 * Usa-se em config/cliente.ts. Não valida aqui (isso faz `src/lib/config` uma única vez)
 * para que um erro de configuração não quebre o import, e sim que se reporte com
 * contexto ao iniciar e em /api/health.
 */
export function definirConfig(entrada: ConfigClienteEntrada): ConfigClienteEntrada {
  return entrada;
}
