/**
 * Convert horizontal FOV to vertical FOV
 * @param horizontalFovDegrees Horizontal field of view in degrees
 * @param aspectRatio Viewport aspect ratio (width / height)
 * @returns Vertical field of view in radians (for Babylon.js)
 */
export function horizontalFovToVertical(horizontalFovDegrees: number, aspectRatio: number): number {
  const horizontalFovRadians = (horizontalFovDegrees * Math.PI) / 180;
  const verticalFovRadians = 2 * Math.atan(Math.tan(horizontalFovRadians / 2) / aspectRatio);
  return verticalFovRadians;
}

/**
 * Convert vertical FOV to horizontal FOV
 * @param verticalFovRadians Vertical field of view in radians
 * @param aspectRatio Viewport aspect ratio (width / height)
 * @returns Horizontal field of view in degrees
 */
export function verticalFovToHorizontal(verticalFovRadians: number, aspectRatio: number): number {
  const horizontalFovRadians = 2 * Math.atan(Math.tan(verticalFovRadians / 2) * aspectRatio);
  const horizontalFovDegrees = (horizontalFovRadians * 180) / Math.PI;
  return horizontalFovDegrees;
}
