import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Bucket de arquivos, por protocolo S3. Hoje aponta para Cloudflare R2; MinIO, Garage ou
 * Supabase Storage são as mesmas cinco variáveis e nenhuma mudança de código.
 *
 * O servidor NUNCA recebe o arquivo: assina uma URL de upload (PUT) e o navegador
 * a usa direto contra o bucket. A Vercel corta os corpos a 4,5 MB, e além disso assim
 * um PDF de 20 MB não gasta nem um milissegundo de função. Para ler, igual: URL de
 * download assinada que vence em um minuto.
 *
 * Requer CORS no bucket para a origem do CRM (PUT + GET, header content-type).
 */

const ENV = {
  endpoint: process.env.S3_ENDPOINT,
  bucket: process.env.S3_BUCKET,
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  region: process.env.S3_REGION || "auto",
};

export function storageConfigured(): boolean {
  return Boolean(ENV.endpoint && ENV.bucket && ENV.accessKeyId && ENV.secretAccessKey);
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!storageConfigured()) {
    throw new Error(
      "Storage sin configurar: faltan S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID o S3_SECRET_ACCESS_KEY"
    );
  }
  if (!client) {
    client = new S3Client({
      endpoint: ENV.endpoint,
      region: ENV.region,
      credentials: { accessKeyId: ENV.accessKeyId!, secretAccessKey: ENV.secretAccessKey! },
      // MinIO e R2 sem domínio próprio vão por path (bucket na rota, não no host).
      forcePathStyle: true,
    });
  }
  return client;
}

const bucket = () => ENV.bucket!;

/** O que se aceita subir. Fora disto, o servidor não assina a URL. */
export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const UPLOAD_URL_TTL = 5 * 60; // segundos: tempo para começar o PUT, não para terminá-lo
const DOWNLOAD_URL_TTL = 60;

/** URL assinada para que o navegador faça PUT do arquivo com esse content-type. */
export async function signUpload(key: string, mime: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime }),
    { expiresIn: UPLOAD_URL_TTL }
  );
}

/** URL assinada de leitura. `inline` abre no navegador (PDF/imagem); senão, baixa. */
export async function signDownload(
  key: string,
  opts: { filename: string; mime: string; inline: boolean }
): Promise<string> {
  const disposition = `${opts.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(opts.filename)}`;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ResponseContentType: opts.mime,
      ResponseContentDisposition: disposition,
    }),
    { expiresIn: DOWNLOAD_URL_TTL }
  );
}

/** Tamanho real do objeto, ou null se não existe (o upload se cortou ou nunca começou). */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return head.ContentLength ?? 0;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "NotFound" || name === "NoSuchKey") return null;
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Apagamento em lote (ao eliminar um contato). Best-effort: uma falha não freia o resto. */
export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // O S3 aceita até 1000 por chamada.
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      })
    );
  }
}

/** Nome seguro para a chave do bucket: sem rotas, sem caracteres estranhos, com extensão. */
export function safeFilename(name: string, mime: string): string {
  const ext = ALLOWED_MIME[mime];
  const base = name
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "archivo"}.${ext}`;
}
