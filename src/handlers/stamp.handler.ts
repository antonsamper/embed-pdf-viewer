import { transformCoordinates } from './utils';

export const placeStamp = (annotation, page) => {
    // Get page rotation
    const rotation = page.rotation || 0;

    // Transform coordinates based on rotation
    const transformedPosition = transformCoordinates(annotation.position, rotation);

    // Position the stamp
    annotation.render(transformedPosition);
};