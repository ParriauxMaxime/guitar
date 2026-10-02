import { mmToPx } from './neckGeometry'

export interface Viewport {
  width: number
  height: number
}

export type ToolbarPlacement = 'top' | 'side'

export interface StageLayout {
  /** Stage is turned 90° clockwise so the neck runs along a narrow portrait screen. */
  rotated: boolean
  width: number
  height: number
  toolbar: ToolbarPlacement
}

export const TOOLBAR_SIZE: Record<ToolbarPlacement, number> = { top: 44, side: 56 }

const NARROW_PORTRAIT_WIDTH = 600

export function computeStageLayout({ width, height }: Viewport, neckWidthMm: number): StageLayout {
  const rotated = width < NARROW_PORTRAIT_WIDTH && height > width
  const stageWidth = rotated ? height : width
  const stageHeight = rotated ? width : height
  // The bar moves to the nut end rather than squeeze a neck that needs the whole height.
  const neckFitsUnderTopBar = stageHeight - TOOLBAR_SIZE.top >= mmToPx(neckWidthMm)
  return {
    rotated,
    width: stageWidth,
    height: stageHeight,
    toolbar: neckFitsUnderTopBar ? 'top' : 'side',
  }
}
