import { Paper, IconButton, Popper } from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import ContentPasteOutlinedIcon from '@mui/icons-material/ContentPasteOutlined';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { MenuWrapperProps } from '@embedpdf/utils/react';
import { useEffect, useState } from 'react';
import { PdfAnnotationSubtype, PdfStampAnnoObject } from '@embedpdf/models';

interface AnnotationSelectionMenuProps {
  menuWrapperProps: MenuWrapperProps;
  selected: TrackedAnnotation;
  container?: HTMLElement | null;
}

export function AnnotationSelectionMenu({
  selected,
  container,
  menuWrapperProps,
}: AnnotationSelectionMenuProps) {
  const { provides: annotation } = useAnnotationCapability();
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);

  const handleDelete = () => {
    if (!annotation) return;
    const { pageIndex, id } = selected.object;
    annotation.deleteAnnotation(pageIndex, id);
  };

  // Keyboard shortcuts: Cmd/Ctrl + C / V
  useEffect(() => {
    const target: HTMLElement | Document = document;
console.log('999');
    const isTypingTarget = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return (
        t.isContentEditable ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (tag === 'DIV' && t.getAttribute('role') === 'textbox')
      );
    };

    const onKeyDown = async (e: KeyboardEvent) => {
      console.log('222');
      if (e.defaultPrevented) return;
      console.log('ad');
      if (isTypingTarget(e.target)) return;
console.log('asda');
      const isCopy = (e.key === 'c' || e.code === 'KeyC') && (e.metaKey || e.ctrlKey);
      const isPaste = (e.key === 'v' || e.code === 'KeyV') && (e.metaKey || e.ctrlKey);
      if (!isCopy && !isPaste) return;

      // only act if annotation capability is available
      if (!annotation) return;

      if (isCopy) {
        // copy only when an annotation is selected
        if (selected) {
          e.preventDefault();
          try {
            await handleCopy();
          } catch {
            // ignore
          }
        }
        return;
      }

      if (isPaste) {
        e.preventDefault();
        try {
          await handlePaste();
        } catch {
          // ignore
        }
      }
    };
console.log('000', target);
    // Attach listener
    (target as any).addEventListener('keydown', onKeyDown);
    return () => {
      (target as any).removeEventListener('keydown', onKeyDown);
    };
  }, [annotation, container, selected]);

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

  // Helper: build JSON clipboard payload
  const buildClipboardPayload = async () => {
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
    return payload;
  };

  const handleCopy = async () => {
    try {
      const payload = await buildClipboardPayload();
      const json = JSON.stringify(payload);
      const base64 = encodeToBase64(json);
      await navigator.clipboard.writeText(base64);
    } catch (e) {
      // Swallow clipboard errors silently to avoid UX noise; log for dev
      // eslint-disable-next-line no-console
      console.warn('Copy failed', e);
    }
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

  const handlePaste = async () => {
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
        // eslint-disable-next-line no-console
        console.info('Paste ignored: decoded clipboard text is not valid JSON');
        return;
      }

      if (!obj || typeof obj !== 'object') {
        // eslint-disable-next-line no-console
        console.info('Paste ignored: decoded clipboard JSON is not an object');
        return;
      }
      if (obj.type !== 'comp-paste' || !obj.data || typeof obj.data !== 'object') {
        // eslint-disable-next-line no-console
        console.info('Paste ignored: unexpected payload structure (missing type "comp-paste" or data)');
        return;
      }
      if (!obj.data.annotation) {
        // eslint-disable-next-line no-console
        console.info('Paste ignored: payload missing "annotation" field');
        return;
      }

      const source = obj.data.annotation as any;
      const pageIndex = source.pageIndex ?? (selected?.object as any)?.pageIndex;
      // New unique id
      const newId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? (crypto as any).randomUUID()
        : `${source.id ?? 'copied'}-paste-${Math.random().toString(36).slice(2, 8)}`;
      const clone: any = { ...source, id: newId, created: new Date(), pageIndex };

      // Offset rect if present (support both array and object forms)
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
  };

  return (
    <>
      <span {...menuWrapperProps} ref={setAnchorEl} />
      <Popper
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        placement="bottom"
        modifiers={[{ name: 'offset', options: { offset: [0, 8] } }]}
        container={container ?? undefined}
      >
        <Paper
          elevation={2}
          sx={{
            px: 0.5,
            py: 0.25,
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            borderRadius: 1,
            cursor: 'default',
          }}
        >
        <IconButton size="small" onClick={handleCopy} aria-label="Copy annotation">
          <ContentCopyOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={handlePaste} aria-label="Paste annotation">
          <ContentPasteOutlinedIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={handleDelete} aria-label="Delete annotation">
          <DeleteOutlineOutlinedIcon fontSize="small" />
        </IconButton>
        </Paper>
      </Popper>
    </>
  );
}
