import {
  PdfAnnotationObject,
  PdfPageObject,
  Position,
  Rect,
  Size,
  Rotation,
  uuidV4,
  PdfInkAnnoObject,
  PdfPolygonAnnoObject,
  PdfPolylineAnnoObject,
  PdfLineAnnoObject,
  PdfAnnotationSubtype,
} from '@embedpdf/models';

/**
 * Result of duplicating an annotation to all pages
 */
export interface DuplicateAnnotationResult<T extends PdfAnnotationObject = PdfAnnotationObject> {
  /** The annotations that were created, one per target page */
  annotations: T[];
  /** Pages where clipping was applied (annotation was adjusted to fit within bounds) */
  clippedPages: number[];
}

/**
 * Options for duplicating an annotation to all pages
 */
export interface DuplicateAnnotationOptions {
  /** Whether to include the source page in the duplication (default: false) */
  includeSourcePage?: boolean;
}

/**
 * Gets the rotated size of a page based on its rotation
 */
function getRotatedPageSize(page: PdfPageObject): Size {
  const isRotated90or270 =
    page.rotation === Rotation.Degree90 || page.rotation === Rotation.Degree270;
  return isRotated90or270
    ? { width: page.size.height, height: page.size.width }
    : { width: page.size.width, height: page.size.height };
}

/**
 * Clamps a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Clips a rectangle to fit within page bounds.
 * Returns the clipped rectangle and whether clipping was applied.
 */
function clipRectToPageBounds(
  rect: Rect,
  pageSize: Size,
): { rect: Rect; wasClipped: boolean } {
  const maxX = pageSize.width;
  const maxY = pageSize.height;

  // Calculate the clipped position and size
  const clippedX = clamp(rect.origin.x, 0, maxX);
  const clippedY = clamp(rect.origin.y, 0, maxY);

  // Calculate maximum possible width/height from the clipped origin
  const maxWidth = maxX - clippedX;
  const maxHeight = maxY - clippedY;

  const clippedWidth = Math.min(rect.size.width, maxWidth);
  const clippedHeight = Math.min(rect.size.height, maxHeight);

  const clippedRect: Rect = {
    origin: { x: clippedX, y: clippedY },
    size: { width: Math.max(0, clippedWidth), height: Math.max(0, clippedHeight) },
  };

  const wasClipped =
    clippedX !== rect.origin.x ||
    clippedY !== rect.origin.y ||
    clippedWidth !== rect.size.width ||
    clippedHeight !== rect.size.height;

  return { rect: clippedRect, wasClipped };
}

/**
 * Clips a position to fit within page bounds
 */
function clipPositionToPageBounds(
  position: Position,
  pageSize: Size,
): { position: Position; wasClipped: boolean } {
  const clippedX = clamp(position.x, 0, pageSize.width);
  const clippedY = clamp(position.y, 0, pageSize.height);

  return {
    position: { x: clippedX, y: clippedY },
    wasClipped: clippedX !== position.x || clippedY !== position.y,
  };
}

/**
 * Transforms coordinates from source page to target page, accounting for different page sizes and rotations.
 * The coordinates are preserved relative to the page coordinate space.
 */
function transformRectForTargetPage(
  rect: Rect,
  _sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { rect: Rect; wasClipped: boolean } {
  // For now, we keep the same coordinates (position and size) as the source.
  // The annotation will appear at the same x,y position on all pages.
  // If the target page is smaller, we clip the annotation to fit.
  const targetSize = getRotatedPageSize(targetPage);

  return clipRectToPageBounds(rect, targetSize);
}

/**
 * Transforms a position for the target page, clipping if necessary
 */
function transformPositionForTargetPage(
  position: Position,
  _sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { position: Position; wasClipped: boolean } {
  const targetSize = getRotatedPageSize(targetPage);
  return clipPositionToPageBounds(position, targetSize);
}

/**
 * Transforms ink annotation paths for the target page
 */
function transformInkAnnotation(
  annotation: PdfInkAnnoObject,
  sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { annotation: PdfInkAnnoObject; wasClipped: boolean } {
  let wasClipped = false;
  const targetSize = getRotatedPageSize(targetPage);

  const transformedInkList = annotation.inkList.map((ink) => ({
    points: ink.points.map((point) => {
      const result = clipPositionToPageBounds(point, targetSize);
      if (result.wasClipped) wasClipped = true;
      return result.position;
    }),
  }));

  const rectResult = transformRectForTargetPage(annotation.rect, sourcePage, targetPage);
  if (rectResult.wasClipped) wasClipped = true;

  return {
    annotation: {
      ...annotation,
      inkList: transformedInkList,
      rect: rectResult.rect,
    },
    wasClipped,
  };
}

/**
 * Transforms polygon annotation vertices for the target page
 */
function transformPolygonAnnotation(
  annotation: PdfPolygonAnnoObject,
  sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { annotation: PdfPolygonAnnoObject; wasClipped: boolean } {
  let wasClipped = false;

  const transformedVertices = annotation.vertices.map((vertex) => {
    const result = transformPositionForTargetPage(vertex, sourcePage, targetPage);
    if (result.wasClipped) wasClipped = true;
    return result.position;
  });

  const rectResult = transformRectForTargetPage(annotation.rect, sourcePage, targetPage);
  if (rectResult.wasClipped) wasClipped = true;

  return {
    annotation: {
      ...annotation,
      vertices: transformedVertices,
      rect: rectResult.rect,
    },
    wasClipped,
  };
}

/**
 * Transforms polyline annotation vertices for the target page
 */
function transformPolylineAnnotation(
  annotation: PdfPolylineAnnoObject,
  sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { annotation: PdfPolylineAnnoObject; wasClipped: boolean } {
  let wasClipped = false;

  const transformedVertices = annotation.vertices.map((vertex) => {
    const result = transformPositionForTargetPage(vertex, sourcePage, targetPage);
    if (result.wasClipped) wasClipped = true;
    return result.position;
  });

  const rectResult = transformRectForTargetPage(annotation.rect, sourcePage, targetPage);
  if (rectResult.wasClipped) wasClipped = true;

  return {
    annotation: {
      ...annotation,
      vertices: transformedVertices,
      rect: rectResult.rect,
    },
    wasClipped,
  };
}

/**
 * Transforms line annotation for the target page
 */
function transformLineAnnotation(
  annotation: PdfLineAnnoObject,
  sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { annotation: PdfLineAnnoObject; wasClipped: boolean } {
  let wasClipped = false;

  const startResult = transformPositionForTargetPage(
    annotation.linePoints.start,
    sourcePage,
    targetPage,
  );
  const endResult = transformPositionForTargetPage(
    annotation.linePoints.end,
    sourcePage,
    targetPage,
  );

  if (startResult.wasClipped || endResult.wasClipped) wasClipped = true;

  const rectResult = transformRectForTargetPage(annotation.rect, sourcePage, targetPage);
  if (rectResult.wasClipped) wasClipped = true;

  return {
    annotation: {
      ...annotation,
      linePoints: {
        start: startResult.position,
        end: endResult.position,
      },
      rect: rectResult.rect,
    },
    wasClipped,
  };
}

/**
 * Transforms a generic annotation for the target page
 */
function transformAnnotationForTargetPage<T extends PdfAnnotationObject>(
  annotation: T,
  sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { annotation: T; wasClipped: boolean } {
  // Handle specific annotation types that have path-based data
  switch (annotation.type) {
    case PdfAnnotationSubtype.INK:
      return transformInkAnnotation(
        annotation as PdfInkAnnoObject,
        sourcePage,
        targetPage,
      ) as { annotation: T; wasClipped: boolean };

    case PdfAnnotationSubtype.POLYGON:
      return transformPolygonAnnotation(
        annotation as PdfPolygonAnnoObject,
        sourcePage,
        targetPage,
      ) as { annotation: T; wasClipped: boolean };

    case PdfAnnotationSubtype.POLYLINE:
      return transformPolylineAnnotation(
        annotation as PdfPolylineAnnoObject,
        sourcePage,
        targetPage,
      ) as { annotation: T; wasClipped: boolean };

    case PdfAnnotationSubtype.LINE:
      return transformLineAnnotation(
        annotation as PdfLineAnnoObject,
        sourcePage,
        targetPage,
      ) as { annotation: T; wasClipped: boolean };

    default: {
      // For simple annotations, just transform the rect
      const rectResult = transformRectForTargetPage(annotation.rect, sourcePage, targetPage);
      return {
        annotation: {
          ...annotation,
          rect: rectResult.rect,
        },
        wasClipped: rectResult.wasClipped,
      };
    }
  }
}

/**
 * Creates a duplicate annotation for a target page.
 * The annotation is given a new unique ID and its coordinates are transformed
 * to fit the target page.
 */
export function createDuplicateAnnotation<T extends PdfAnnotationObject>(
  sourceAnnotation: T,
  sourcePage: PdfPageObject,
  targetPage: PdfPageObject,
): { annotation: T; wasClipped: boolean } {
  const { annotation: transformedAnnotation, wasClipped } = transformAnnotationForTargetPage(
    sourceAnnotation,
    sourcePage,
    targetPage,
  );

  // Create a new annotation with a unique ID and updated page index
  const duplicatedAnnotation: T = {
    ...transformedAnnotation,
    id: uuidV4(),
    pageIndex: targetPage.index,
    created: new Date(),
  };

  return { annotation: duplicatedAnnotation, wasClipped };
}

/**
 * Generates duplicate annotations for all pages in a document.
 * This is the core logic function that computes the duplicated annotations
 * without persisting them.
 *
 * @param sourceAnnotation - The annotation to duplicate
 * @param pages - All pages in the document
 * @param options - Duplication options
 * @returns The result containing all duplicated annotations and pages where clipping was applied
 */
export function generateDuplicateAnnotations<T extends PdfAnnotationObject>(
  sourceAnnotation: T,
  pages: PdfPageObject[],
  options: DuplicateAnnotationOptions = {},
): DuplicateAnnotationResult<T> {
  const { includeSourcePage = false } = options;

  const sourcePage = pages.find((p) => p.index === sourceAnnotation.pageIndex);
  if (!sourcePage) {
    throw new Error(`Source page not found for annotation on page ${sourceAnnotation.pageIndex}`);
  }

  const annotations: T[] = [];
  const clippedPages: number[] = [];

  for (const targetPage of pages) {
    // Skip source page unless explicitly included
    if (!includeSourcePage && targetPage.index === sourceAnnotation.pageIndex) {
      continue;
    }

    const { annotation, wasClipped } = createDuplicateAnnotation(
      sourceAnnotation,
      sourcePage,
      targetPage,
    );

    annotations.push(annotation);

    if (wasClipped) {
      clippedPages.push(targetPage.index);
      console.warn(
        `Annotation ${sourceAnnotation.id} was clipped when duplicating to page ${targetPage.index}. ` +
          `Target page size (${targetPage.size.width}x${targetPage.size.height}) may differ from source.`,
      );
    }
  }

  return { annotations, clippedPages };
}
