let cachedLogoDataUrl: string | null = null;

/**
 * Converte uma imagem remota ou pública para DataURL comprimida (JPEG max 800x800).
 * Se falhar (CORS, offline, 404), retorna null com segurança sem quebrar o fluxo.
 */
export async function loadImageAsDataUrl(
  url?: string | null,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.75
): Promise<string | null> {
  if (!url) return null;

  // Se já for base64 / data URL
  if (url.startsWith('data:image/')) {
    return url;
  }

  // Blob URL local temporária
  if (url.startsWith('blob:')) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      return await blobToCompressedDataUrl(blob, maxWidth, maxHeight, quality);
    } catch {
      return null;
    }
  }

  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await blobToCompressedDataUrl(blob, maxWidth, maxHeight, quality);
  } catch (err) {
    console.warn('[PDF ImageLoader] Falha ao carregar imagem remota (CORS ou rede):', url, err);
    return null;
  }
}

function blobToCompressedDataUrl(
  blob: Blob,
  maxWidth: number,
  maxHeight: number,
  quality: number
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          // Fundo branco para imagens transparentes
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        } catch (e) {
          console.warn('[PDF ImageLoader] Erro ao renderizar canvas:', e);
          resolve(null);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };

      img.src = objectUrl;
    } catch {
      resolve(null);
    }
  });
}

/**
 * Carrega a logomarca do MS Sustentável como Base64 para inclusão no cabeçalho do PDF.
 */
export async function getAppLogoDataUrl(): Promise<string | null> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;

  try {
    // Tenta primeiro logo_ms_sus.png, fallback para logo_emblem.png
    const candidates = ['/logo_ms_sus.png', '/logo_emblem.png'];
    for (const path of candidates) {
      const res = await loadImageAsDataUrl(path, 400, 160, 0.9);
      if (res) {
        cachedLogoDataUrl = res;
        return res;
      }
    }
  } catch (e) {
    console.warn('[PDF ImageLoader] Não foi possível carregar a logo:', e);
  }
  return null;
}

/**
 * Carrega múltiplas imagens de evidência em lote com controle de concorrência.
 */
export async function batchLoadEvidenceImages<T extends { evidenciaUrl?: string | null }>(
  items: T[],
  onProgress?: (progressPercent: number) => void,
  concurrency = 4
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const toLoad = items.filter(it => it.evidenciaUrl && typeof it.evidenciaUrl === 'string');
  const total = toLoad.length;

  if (total === 0) {
    if (onProgress) onProgress(100);
    return result;
  }

  let completed = 0;
  let index = 0;

  async function worker() {
    while (index < toLoad.length) {
      const currentIdx = index++;
      const item = toLoad[currentIdx];
      const url = item.evidenciaUrl!;
      try {
        const dataUrl = await loadImageAsDataUrl(url, 800, 800, 0.75);
        if (dataUrl) {
          result.set(url, dataUrl);
        }
      } catch (err) {
        console.warn(`[PDF ImageLoader] Erro ao baixar evidência ${url}:`, err);
      } finally {
        completed++;
        if (onProgress) {
          const percent = Math.min(100, Math.round((completed / total) * 100));
          onProgress(percent);
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker());
  await Promise.all(workers);

  return result;
}

