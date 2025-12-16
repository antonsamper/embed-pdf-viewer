import {
  generateDuplicateAnnotations,
  createDuplicateAnnotation,
  DuplicateAnnotationResult,
} from '../duplicate-to-all-pages';
import {
  PdfAnnotationSubtype,
  PdfSquareAnnoObject,
  PdfInkAnnoObject,
  PdfLineAnnoObject,
  PdfPolygonAnnoObject,
  PdfPageObject,
  Rotation,
  PdfAnnotationBorderStyle,
} from '@embedpdf/models';

// Helper to create a mock page
function createMockPage(
  index: number,
  width: number,
  height: number,
  rotation: Rotation = Rotation.Degree0,
): PdfPageObject {
  return {
    index,
    size: { width, height },
    rotation,
  };
}

// Helper to create a square annotation
function createSquareAnnotation(
  id: string,
  pageIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
): PdfSquareAnnoObject {
  return {
    id,
    pageIndex,
    type: PdfAnnotationSubtype.SQUARE,
    rect: {
      origin: { x, y },
      size: { width, height },
    },
    color: '#FF0000',
    strokeColor: '#000000',
    strokeWidth: 1,
    opacity: 1,
    flags: ['print'],
    strokeStyle: PdfAnnotationBorderStyle.SOLID,
  };
}

// Helper to create an ink annotation
function createInkAnnotation(
  id: string,
  pageIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
): PdfInkAnnoObject {
  return {
    id,
    pageIndex,
    type: PdfAnnotationSubtype.INK,
    rect: {
      origin: { x, y },
      size: { width, height },
    },
    inkList: [
      {
        points: [
          { x: x + 10, y: y + 10 },
          { x: x + 20, y: y + 20 },
          { x: x + 30, y: y + 30 },
        ],
      },
    ],
    color: '#0000FF',
    strokeWidth: 2,
    opacity: 1,
  };
}

// Helper to create a line annotation
function createLineAnnotation(
  id: string,
  pageIndex: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): PdfLineAnnoObject {
  const minX = Math.min(startX, endX);
  const minY = Math.min(startY, endY);
  const maxX = Math.max(startX, endX);
  const maxY = Math.max(startY, endY);

  return {
    id,
    pageIndex,
    type: PdfAnnotationSubtype.LINE,
    rect: {
      origin: { x: minX, y: minY },
      size: { width: maxX - minX, height: maxY - minY },
    },
    linePoints: {
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
    },
    color: '#00FF00',
    strokeColor: '#000000',
    strokeWidth: 1,
    opacity: 1,
    strokeStyle: PdfAnnotationBorderStyle.SOLID,
  };
}

describe('duplicate-to-all-pages', () => {
  describe('generateDuplicateAnnotations', () => {
    it('should create correct number of annotations (excluding source page)', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
        createMockPage(2, 612, 792),
        createMockPage(3, 612, 792),
      ];
      const annotation = createSquareAnnotation('anno-1', 0, 100, 100, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages);

      // Should create annotations for pages 1, 2, 3 (not page 0)
      expect(result.annotations).toHaveLength(3);
      expect(result.annotations.map((a) => a.pageIndex)).toEqual([1, 2, 3]);
    });

    it('should include source page when option is set', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
        createMockPage(2, 612, 792),
      ];
      const annotation = createSquareAnnotation('anno-1', 0, 100, 100, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages, { includeSourcePage: true });

      expect(result.annotations).toHaveLength(3);
      expect(result.annotations.map((a) => a.pageIndex)).toEqual([0, 1, 2]);
    });

    it('should generate unique IDs for each duplicated annotation', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
        createMockPage(2, 612, 792),
      ];
      const annotation = createSquareAnnotation('original-id', 0, 100, 100, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages);

      const ids = result.annotations.map((a) => a.id);
      // All IDs should be unique
      expect(new Set(ids).size).toBe(ids.length);
      // No ID should match the original
      ids.forEach((id) => {
        expect(id).not.toBe('original-id');
      });
    });

    it('should preserve annotation position and size for same-sized pages', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
        createMockPage(2, 612, 792),
      ];
      const annotation = createSquareAnnotation('anno-1', 0, 100, 200, 50, 75);

      const result = generateDuplicateAnnotations(annotation, pages);

      result.annotations.forEach((anno) => {
        expect(anno.rect.origin.x).toBe(100);
        expect(anno.rect.origin.y).toBe(200);
        expect(anno.rect.size.width).toBe(50);
        expect(anno.rect.size.height).toBe(75);
      });
    });

    it('should preserve annotation properties (color, stroke, etc.)', () => {
      const pages = [createMockPage(0, 612, 792), createMockPage(1, 612, 792)];
      const annotation = createSquareAnnotation('anno-1', 0, 100, 100, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages);

      expect(result.annotations[0].color).toBe('#FF0000');
      expect(result.annotations[0].strokeColor).toBe('#000000');
      expect(result.annotations[0].strokeWidth).toBe(1);
      expect(result.annotations[0].opacity).toBe(1);
    });
  });

  describe('clipping behavior for different page sizes', () => {
    it('should clip annotation when target page is smaller', () => {
      const pages = [
        createMockPage(0, 612, 792), // Source: letter size
        createMockPage(1, 300, 400), // Target: smaller page
      ];
      // Annotation at position that would be outside smaller page
      const annotation = createSquareAnnotation('anno-1', 0, 400, 500, 100, 100);

      const result = generateDuplicateAnnotations(annotation, pages);

      expect(result.clippedPages).toContain(1);
      // The annotation should be clipped to fit within bounds
      const clippedAnno = result.annotations[0];
      expect(clippedAnno.rect.origin.x).toBeLessThanOrEqual(300);
      expect(clippedAnno.rect.origin.y).toBeLessThanOrEqual(400);
    });

    it('should not clip annotation when it fits on target page', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792), // Same size
        createMockPage(2, 1000, 1000), // Larger page
      ];
      const annotation = createSquareAnnotation('anno-1', 0, 100, 100, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages);

      expect(result.clippedPages).toHaveLength(0);
    });

    it('should handle pages with different rotations', () => {
      const pages = [
        createMockPage(0, 612, 792, Rotation.Degree0),
        createMockPage(1, 612, 792, Rotation.Degree90),
        createMockPage(2, 612, 792, Rotation.Degree180),
        createMockPage(3, 612, 792, Rotation.Degree270),
      ];
      const annotation = createSquareAnnotation('anno-1', 0, 100, 100, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages);

      // All annotations should be created successfully
      expect(result.annotations).toHaveLength(3);
      // Annotation fits within all rotated page bounds
      expect(result.clippedPages).toHaveLength(0);
    });
  });

  describe('path-based annotation handling', () => {
    it('should transform ink annotation points', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
      ];
      const annotation = createInkAnnotation('ink-1', 0, 100, 100, 40, 40);

      const result = generateDuplicateAnnotations(annotation, pages);

      const duplicatedInk = result.annotations[0] as PdfInkAnnoObject;
      expect(duplicatedInk.inkList).toBeDefined();
      expect(duplicatedInk.inkList[0].points).toHaveLength(3);
      // Points should be preserved (same coordinates for same-size pages)
      expect(duplicatedInk.inkList[0].points[0]).toEqual({ x: 110, y: 110 });
    });

    it('should clip ink annotation points when target page is smaller', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 100, 100), // Very small page
      ];
      const annotation = createInkAnnotation('ink-1', 0, 80, 80, 40, 40);

      const result = generateDuplicateAnnotations(annotation, pages);

      expect(result.clippedPages).toContain(1);
      const duplicatedInk = result.annotations[0] as PdfInkAnnoObject;
      // Points should be clipped to page bounds
      duplicatedInk.inkList[0].points.forEach((point) => {
        expect(point.x).toBeLessThanOrEqual(100);
        expect(point.y).toBeLessThanOrEqual(100);
      });
    });

    it('should transform line annotation points', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
      ];
      const annotation = createLineAnnotation('line-1', 0, 100, 100, 200, 200);

      const result = generateDuplicateAnnotations(annotation, pages);

      const duplicatedLine = result.annotations[0] as PdfLineAnnoObject;
      expect(duplicatedLine.linePoints.start).toEqual({ x: 100, y: 100 });
      expect(duplicatedLine.linePoints.end).toEqual({ x: 200, y: 200 });
    });
  });

  describe('createDuplicateAnnotation', () => {
    it('should create annotation with new ID', () => {
      const sourcePage = createMockPage(0, 612, 792);
      const targetPage = createMockPage(1, 612, 792);
      const annotation = createSquareAnnotation('original', 0, 100, 100, 50, 50);

      const { annotation: duplicated } = createDuplicateAnnotation(
        annotation,
        sourcePage,
        targetPage,
      );

      expect(duplicated.id).not.toBe('original');
      expect(duplicated.id).toHaveLength(36); // UUID v4 format
    });

    it('should set correct pageIndex for target page', () => {
      const sourcePage = createMockPage(0, 612, 792);
      const targetPage = createMockPage(5, 612, 792);
      const annotation = createSquareAnnotation('anno', 0, 100, 100, 50, 50);

      const { annotation: duplicated } = createDuplicateAnnotation(
        annotation,
        sourcePage,
        targetPage,
      );

      expect(duplicated.pageIndex).toBe(5);
    });

    it('should set new created date', () => {
      const sourcePage = createMockPage(0, 612, 792);
      const targetPage = createMockPage(1, 612, 792);
      const annotation = createSquareAnnotation('anno', 0, 100, 100, 50, 50);

      const { annotation: duplicated } = createDuplicateAnnotation(
        annotation,
        sourcePage,
        targetPage,
      );

      expect(duplicated.created).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('should throw error when source page is not found', () => {
      const pages = [createMockPage(1, 612, 792), createMockPage(2, 612, 792)];
      const annotation = createSquareAnnotation('anno', 0, 100, 100, 50, 50); // Page 0 doesn't exist

      expect(() => generateDuplicateAnnotations(annotation, pages)).toThrow(
        'Source page not found',
      );
    });

    it('should handle single page document', () => {
      const pages = [createMockPage(0, 612, 792)];
      const annotation = createSquareAnnotation('anno', 0, 100, 100, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages);

      // No duplications should occur
      expect(result.annotations).toHaveLength(0);
    });

    it('should handle annotation at page edge', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
      ];
      // Annotation right at the edge
      const annotation = createSquareAnnotation('anno', 0, 562, 742, 50, 50);

      const result = generateDuplicateAnnotations(annotation, pages);

      expect(result.annotations).toHaveLength(1);
      // No clipping needed for same-size pages
      expect(result.clippedPages).toHaveLength(0);
    });

    it('should handle zero-size annotations gracefully', () => {
      const pages = [
        createMockPage(0, 612, 792),
        createMockPage(1, 612, 792),
      ];
      const annotation = createSquareAnnotation('anno', 0, 100, 100, 0, 0);

      const result = generateDuplicateAnnotations(annotation, pages);

      expect(result.annotations).toHaveLength(1);
      expect(result.annotations[0].rect.size.width).toBe(0);
      expect(result.annotations[0].rect.size.height).toBe(0);
    });
  });
});
