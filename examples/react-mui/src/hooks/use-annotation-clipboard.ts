import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models';
import { useCallback, useEffect, useState } from 'react';

// Helper: base64 encode/decode full JSON payloads (handles unicode)
const encodeToBase64 = (str: string) =>
  btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16)),
    ),
  );

const decodeFromBase64 = (b64: string) => {
  try {
    const bin = atob(b64);
    const percentEncoded = Array.prototype
      .map
      .call(bin, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('');
    return decodeURIComponent(percentEncoded);
  } catch (e) {
    return null;
  }
};

// Helper: load source image at intrinsic dimensions and return ImageData
const loadImageDataIntrinsic = async (src: string) => {
  return new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    (img as HTMLImageElement).crossOrigin = 'anonymous';
    img.onload = () => {
      const w = Math.max(1, Math.round(img.width));
      const h = Math.max(1, Math.round(img.height));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('2D context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const imageData = ctx.getImageData(0, 0, w, h);
        resolve(imageData);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load stamp image'));
    img.src = src;
  });
};

// Helper: given an image src, return base64 PNG of the intrinsic image
const imageSrcToBase64 = async (src: string) => {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    (img as HTMLImageElement).crossOrigin = 'anonymous';
    img.onload = () => {
      const w = Math.max(1, Math.round(img.width));
      const h = Math.max(1, Math.round(img.height));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('2D context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1] ?? '';
        resolve(base64);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
};

const base64ToImageData = async (base64: string) => {
  return new Promise<ImageData>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.round(img.width));
      const h = Math.max(1, Math.round(img.height));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('2D context not available'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, w, h);
        resolve(imageData);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Failed to decode base64 image'));
    img.src = `data:image/png;base64,${base64}`;
  });
};

export function useAnnotationClipboard() {
  const { provides: annotation } = useAnnotationCapability();
  const { state: scrollState } = useScroll();
  const [canPaste, setCanPaste] = useState(false);

  const checkClipboard = useCallback(async () => {
    try {
      if (typeof navigator.clipboard.readText !== 'function') {
        setCanPaste(false);
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text) {
        setCanPaste(false);
        return;
      }
      const decoded = decodeFromBase64(text);
      if (!decoded) {
        setCanPaste(false);
        return;
      }
      const obj = JSON.parse(decoded);
      setCanPaste(!!(obj && obj.type === 'comp-paste' && obj.data?.annotation));
    } catch (e) {
      setCanPaste(false);
    }
  }, []);

  useEffect(() => {
    checkClipboard();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkClipboard();
      }
    };
    window.addEventListener('focus', checkClipboard);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', checkClipboard);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkClipboard]);

  const copyAnnotation = useCallback(async (selected: TrackedAnnotation) => {
    if (!selected) return;
    try {
      const original = selected.object as any;
      const payload: any = { type: 'comp-paste', data: { annotation: original } };
      if (original.type === PdfAnnotationSubtype.STAMP) {
        const stamp = original as PdfStampAnnoObject;
        if (stamp.imageSrc) {
          try {
            const base64 = await imageSrcToBase64(stamp.imageSrc);
            payload.data.imageBase64 = base64;
          } catch (e) {
            // ignore image failure; still copy annotation meta
          }
        }
      }
      const json = JSON.stringify(payload);
      const base64 = encodeToBase64(json);
      await navigator.clipboard.writeText(base64);
      setCanPaste(true);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Copy failed', e);
    }
  }, []);

  const pasteAnnotation = useCallback(async (selected?: TrackedAnnotation) => {
    if (!annotation) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        // eslint-disable-next-line no-console
        console.info('Paste ignored: clipboard is empty or not accessible');
        return;
      }

      const decoded = decodeFromBase64(text);
      if (!decoded) {
        // eslint-disable-next-line no-console
        console.info('Paste ignored: clipboard does not contain a base64-encoded comp-paste payload');
        return;
      }

      let obj: any;
      try {
        obj = JSON.parse(decoded);
      } catch (e) {
        // eslint-disable-next-line No-console
        console.info('Paste ignored: decoded clipboard text is not valid JSON');
        return;
      }

      if (!obj || typeof obj !== 'object' || obj.type !== 'comp-paste' || !obj.data?.annotation) {
        // eslint-disable-next-line no-console
        console.info('Paste ignored: unexpected payload structure');
        return;
      }

      const source = obj.data.annotation as any;
      const currentPage = scrollState?.currentPage !== undefined ? scrollState.currentPage - 1 : undefined;

      let pageIndex: number;
      if (currentPage !== undefined) {
        pageIndex = currentPage;
      } else if (selected?.object?.pageIndex !== undefined) {
        pageIndex = selected.object.pageIndex;
      } else {
        pageIndex = source.pageIndex ?? 0;
      }
      
      console.log({pageIndex, scrollState});

      const newId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? (crypto as any).randomUUID()
        : `${source.id ?? 'copied'}-paste-${Math.random().toString(36).slice(2, 8)}`;

      const clone: any = { ...source, id: newId, created: new Date(), pageIndex };

      const dx = 8, dy = 8;
      if (Array.isArray(clone.rect) && clone.rect.length === 4) {
        const [x1, y1, x2, y2] = clone.rect as [number, number, number, number];
        clone.rect = [x1 + dx, y1 + dy, x2 + dx, y2 + dy];
      } else if (clone.rect?.origin && clone.rect?.size) {
        clone.rect = {
          origin: { x: clone.rect.origin.x + dx, y: clone.rect.origin.y + dy },
          size: { ...clone.rect.size },
        };
      }

      if (clone.type === PdfAnnotationSubtype.STAMP) {
        const base64: string | undefined = obj.data.imageBase64;
        try {
          let imageData: ImageData | undefined;
          if (base64) {
            imageData = await base64ToImageData(base64);
          } else if (clone.imageSrc) {
            imageData = await loadImageDataIntrinsic(clone.imageSrc);
          }
          if (imageData) {
            annotation.createAnnotation(clone.pageIndex, clone, { imageData });
          } else {
            annotation.createAnnotation(clone.pageIndex, clone);
          }
        } catch {
          annotation.createAnnotation(clone.pageIndex, clone);
        }
      } else {
        annotation.createAnnotation(clone.pageIndex, clone);
      }

      annotation.selectAnnotation(clone.pageIndex, clone.id);
      annotation.commit();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Paste failed', e);
    }
  }, [annotation, scrollState]);

  return { copyAnnotation, pasteAnnotation, canPaste };
}
