export interface Point {
  x: number
  y: number
}

export interface ClientBox {
  left: number
  top: number
  right: number
}

/**
 * Maps viewport coordinates into an element's own (untransformed) coordinate
 * space, given its client bounding box. When the stage is rotated 90° clockwise
 * the element's x axis runs down the screen and its y axis runs right-to-left.
 */
export function clientToLocal(
  box: ClientBox,
  rotated: boolean,
  clientX: number,
  clientY: number,
): Point {
  return rotated
    ? { x: clientY - box.top, y: box.right - clientX }
    : { x: clientX - box.left, y: clientY - box.top }
}
