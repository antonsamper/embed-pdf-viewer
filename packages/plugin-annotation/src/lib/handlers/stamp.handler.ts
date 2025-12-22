const placeStamp = (imageData: ImageData, width: number, height: number) => {
  // Adjust coordinates for page rotation
  const { x: adjustedX, y: adjustedY } = transformCoordinates({
    x: pos.x, y: pos.y, width, height, rotation: context.rotation,
    pageSize: { width: pageSize.width, height: pageSize.height } });

  const rect: Rect = {
    origin: { x: adjustedX, y: adjustedY },
    size: { width, height },
  };

  const anno: PdfStampAnnoObject = {
    ...tool.defaults,
    rect,
    type: PdfAnnotationSubtype.STAMP,
    icon: tool.defaults.icon ?? PdfAnnotationIcon.Draft,
    subject: tool.defaults.subject ?? 'Stamp',
    flags: tool.defaults.flags ?? ['print'],
    pageIndex: context.pageIndex,
    id: uuidV4(),
    created: new Date(),
  };

  onCommit(anno, { imageData });
};