import { Injectable } from '@angular/core';
import { fabric } from 'fabric';
import { ExtendedObject, MapConfiguration, VenueMapTheme } from './venue-map.type';
import { scaleValue } from './venue-map.utils';

@Injectable({
  providedIn: 'root',
})
export class VenueMapMiniMapService {
  // ============================================================================
  // PROPERTIES
  // ============================================================================
  public miniMapCanvas!: fabric.StaticCanvas;
  private miniMapRect!: fabric.Rect;

  // ============================================================================
  // PUBLIC METHODS - MINIMAP INITIALIZATION
  // ============================================================================

  /**
   * Initializes the mini map canvas with the specified element
   */
  public initializeMiniMap(
    miniCanvasElement: HTMLCanvasElement,
    mapWidth: number,
    viewDimensions: { width: number; height: number; scale: number },
    mapConfig: MapConfiguration
  ): void {
    if (!miniCanvasElement) return;

    const miniMapScale = mapConfig.minimap.scale;
    const containerHeight = viewDimensions.height;

    this.miniMapCanvas = new fabric.StaticCanvas('miniMap', {
      width: scaleValue(mapWidth, viewDimensions.scale) * miniMapScale,
      height: containerHeight * miniMapScale,
    });
  }

  /**
   * Renders the mini map using data from the main canvas
   */
  public renderMiniMap(mainCanvas: fabric.Canvas): void {
    if (!this.miniMapCanvas || !mainCanvas) return;

    const mainCanvasImage = mainCanvas.toDataURL({
      format: 'png',
      quality: 1.0,
    });

    fabric.Image.fromURL(mainCanvasImage, (img) => {
      if (!img) return;

      img.scaleToWidth(this.miniMapCanvas.getWidth());
      img.scaleToHeight(this.miniMapCanvas.getHeight());
      this.miniMapCanvas.setBackgroundImage(img, () => {});
    }, { crossOrigin: 'anonymous' });

    this.miniMapCanvas.renderAll();
  }

  /**
   * Displays the viewport rectangle on the mini map
   */
  public showViewportRect(
    viewportTransform: number[] | undefined,
    canvasWidth: number,
    canvasHeight: number,
    currentZoom: number,
    viewDimensions: { width: number; height: number; scale: number },
    mapConfig: MapConfiguration,
    theme: VenueMapTheme
  ): void {
    if (this.miniMapRect) this.miniMapCanvas?.remove(this.miniMapRect);

    const minimapConfig = mapConfig.minimap;
    const scale = minimapConfig.scale;
    const position = this.findPositionViewport(
      viewportTransform,
      currentZoom,
      canvasWidth,
      canvasHeight,
      viewDimensions,
      scale
    );

    this.miniMapRect = new fabric.Rect({
      ...position,
      fill: theme.miniMapViewportColor,
      selectable: false,
      opacity: minimapConfig.opacity,
    });

    (this.miniMapRect as ExtendedObject).set('id', 'viewportZoom');

    this.miniMapCanvas?.add(this.miniMapRect);
  }

  /**
   * Finds the position and dimensions of the viewport rectangle on the mini map
   */
  private findPositionViewport(
    viewportTransform: number[] | undefined,
    currentZoom: number,
    canvasWidth: number,
    canvasHeight: number,
    viewDimensions: { width: number; height: number; scale: number },
    scale = 1
  ) {
    const canvasWidthScaled = (canvasWidth * scale) / currentZoom;
    const canvasHeightScaled = (canvasHeight * scale) / currentZoom;

    const width = (viewDimensions.width * scale) / currentZoom;
    const height = canvasHeightScaled;

    const left =
      (-(viewportTransform?.[4] ?? 0) * scale) / currentZoom +
      (canvasWidthScaled - width) / 2;
    const top = (-(viewportTransform?.[5] ?? 0) * scale) / currentZoom;

    return { top, left, width, height };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Cleans up resources when service is no longer needed
   */
  public cleanup(): void {
    if (this.miniMapCanvas) {
      this.miniMapCanvas.clear();
      this.miniMapCanvas.dispose();
      this.miniMapCanvas = undefined!;
    }
  }
}
