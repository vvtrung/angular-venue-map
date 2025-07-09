import { Injectable } from '@angular/core';
import { fabric } from 'fabric';
import {
  ExtendedImage,
  MapConfiguration,
  MapSetting,
  FabricCanvas
} from './venue-map.type';

/**
 * Service responsible for rendering venue map images and backgrounds.
 * Handles both single images and multi-part image loading.
 * For multi-part images, follows a file naming pattern: col_row.ext
 * Example: 0_0.png, 0_1.png, 1_0.png, 1_1.png
 * Also manages background image loading and canvas setup for venue maps.
 */
@Injectable({
  providedIn: 'root',
})
export class VenueMapRenderService {

  // ============================================================================
  // MULTI-PART IMAGE METHODS
  // ============================================================================

  /**
   * Determines if the path represents multiple image parts
   * @param path - Single path string or array of paths
   * @returns true if multiple parts should be rendered
   */
  public isMultiPartImage(path: string | string[]): boolean {
    return Array.isArray(path);
  }

  /**
   * Generates image paths based on pattern col_row.ext
   * @param basePath - Base path template (e.g., '/images/map/parts/{col}_{row}.png')
   * @param cols - Number of columns
   * @param rows - Number of rows
   * @returns Array of image paths
   */
  public generateImagePaths(basePath: string, cols: number, rows: number): string[] {
    const paths: string[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const path = basePath
          .replace('{col}', col.toString())
          .replace('{row}', row.toString());
        paths.push(path);
      }
    }

    return paths;
  }

  /**
   * Parses column and row from filename pattern col_row.ext
   * @param filename - Filename to parse (e.g., '0_1.png')
   * @returns Object with col and row numbers, or null if pattern doesn't match
   */
  public parseImageCoordinates(filename: string): { col: number; row: number } | null {
    // Extract filename without path
    const name = filename.split('/').pop() || filename;

    // Remove extension
    const nameWithoutExt = name.split('.')[0];

    // Match pattern: col_row
    const match = nameWithoutExt.match(/^(\d+)_(\d+)$/);

    if (match) {
      return {
        col: parseInt(match[1], 10),
        row: parseInt(match[2], 10)
      };
    }

    return null;
  }

  /**
   * Calculates grid dimensions from array of image paths
   * @param paths - Array of image paths
   * @returns Object with cols and rows dimensions
   */
  public calculateGridDimensions(paths: string[]): { cols: number; rows: number } {
    let maxCol = 0;
    let maxRow = 0;

    for (const path of paths) {
      const coords = this.parseImageCoordinates(path);
      if (coords) {
        maxCol = Math.max(maxCol, coords.col);
        maxRow = Math.max(maxRow, coords.row);
      }
    }

    return {
      cols: maxCol + 1,
      rows: maxRow + 1
    };
  }

  /**
   * Loads multiple images and creates a composite fabric.Image
   * @param paths - Array of image paths
   * @param totalWidth - Total width of the composite image
   * @param totalHeight - Total height of the composite image
   * @param callback - Callback function with the composite image
   */
  public loadMultiPartImage(
    paths: string[],
    totalWidth: number,
    totalHeight: number,
    callback: (compositeImage: fabric.Image) => void
  ): void {
    const { cols, rows } = this.calculateGridDimensions(paths);

    if (cols === 0 || rows === 0) {
      console.error('Invalid grid dimensions calculated from paths');
      return;
    }

    const partWidth = totalWidth / cols;
    const partHeight = totalHeight / rows;

    // Create canvas for compositing
    const compositeCanvas = new fabric.StaticCanvas(null, {
      width: totalWidth,
      height: totalHeight
    });

    let loadedCount = 0;
    const totalParts = paths.length;

    // Load each image part
    paths.forEach(path => {
      fabric.Image.fromURL(
        path,
        (img) => {
          if (!img) {
            console.error(`Failed to load image: ${path}`);
            loadedCount++;
            if (loadedCount === totalParts) {
              this.finalizeCompositeImage(compositeCanvas, callback);
            }
            return;
          }

          const coords = this.parseImageCoordinates(path);
          if (!coords) {
            console.error(`Could not parse coordinates from path: ${path}`);
            loadedCount++;
            if (loadedCount === totalParts) {
              this.finalizeCompositeImage(compositeCanvas, callback);
            }
            return;
          }

          // Position the image part
          const x = coords.col * partWidth;
          const y = coords.row * partHeight;

          img.set({
            left: x,
            top: y,
            scaleX: partWidth / (img.width || 1),
            scaleY: partHeight / (img.height || 1),
            selectable: false,
            evented: false
          });

          compositeCanvas.add(img);
          loadedCount++;

          if (loadedCount === totalParts) {
            this.finalizeCompositeImage(compositeCanvas, callback);
          }
        },
        { crossOrigin: 'anonymous' }
      );
    });
  }

  /**
   * Finalizes the composite image and returns it via callback
   * @param compositeCanvas - Canvas containing all image parts
   * @param callback - Callback function with the final composite image
   */
  private finalizeCompositeImage(
    compositeCanvas: fabric.StaticCanvas,
    callback: (compositeImage: fabric.Image) => void
  ): void {
    // Render the canvas and create a new fabric.Image from it
    const dataURL = compositeCanvas.toDataURL({
      format: 'png',
      quality: 1.0
    });

    fabric.Image.fromURL(
      dataURL,
      (compositeImage) => {
        if (compositeImage) {
          compositeImage.set({
            selectable: false,
            evented: false,
            objectCaching: false
          });
          callback(compositeImage);
        }
      },
      { crossOrigin: 'anonymous' }
    );
  }

  /**
   * Loads a single image
   * @param path - Image path
   * @param callback - Callback function with the loaded image
   */
  public loadSingleImage(
    path: string,
    callback: (img: fabric.Image) => void
  ): void {
    fabric.Image.fromURL(path, callback, { crossOrigin: 'anonymous' });
  }

  // ============================================================================
  // VENUE IMAGE RENDERING METHODS
  // ============================================================================

  /**
   * Loads background image for the venue map canvas
   * @param canvas - Fabric canvas instance
   * @param mapConfig - Map configuration
   * @param viewDimensions - View dimensions
   * @param pathImg - Image path (single or array)
   * @param callback - Callback function with mapWidth
   */
  public loadBackgroundImage(
    canvas: FabricCanvas,
    mapConfig: MapConfiguration,
    viewDimensions: MapSetting,
    pathImg?: string | string[],
    callback?: (mapWidth: number) => void
  ): void {
    if (!canvas) return;

    const { path } = mapConfig;
    const targetPath = pathImg ?? path;

    const backgroundImage = canvas.backgroundImage;

    if (backgroundImage && backgroundImage instanceof fabric.Image) {
      canvas.remove(backgroundImage);
    }

    // Check if it's a multi-part image
    if (this.isMultiPartImage(targetPath)) {
      this.loadMultiPartBackgroundImage(canvas, mapConfig, viewDimensions, targetPath as string[], callback);
    } else {
      this.loadSingleBackgroundImage(canvas, mapConfig, viewDimensions, targetPath as string, callback);
    }
  }

  /**
   * Loads a single background image
   */
  private loadSingleBackgroundImage(
    canvas: FabricCanvas,
    mapConfig: MapConfiguration,
    viewDimensions: MapSetting,
    path: string,
    callback?: (mapWidth: number) => void
  ): void {
    fabric.Image.fromURL(path, img => {
      if (!img) return;
      const result = this.setDataImageToCanvas(canvas, mapConfig, viewDimensions, img);
      callback?.(result.mapWidth);
    }, { crossOrigin: 'anonymous' });
  }

  /**
   * Loads multiple image parts and creates a composite background
   */
  private loadMultiPartBackgroundImage(
    canvas: FabricCanvas,
    mapConfig: MapConfiguration,
    viewDimensions: MapSetting,
    paths: string[],
    callback?: (mapWidth: number) => void
  ): void {
    const { width, height } = mapConfig;

    this.loadMultiPartImage(
      paths,
      width,
      height,
      (compositeImage) => {
        if (!compositeImage) return;
        const result = this.setDataImageToCanvas(canvas, mapConfig, viewDimensions, compositeImage);
        callback?.(result.mapWidth);
      }
    );
  }



  /**
   * Sets image data to canvas and configures canvas properties
   */
  private setDataImageToCanvas(
    canvas: FabricCanvas,
    mapConfig: MapConfiguration,
    viewDimensions: MapSetting,
    img: fabric.Image
  ): { mapWidth: number } {
    mapConfig.width = img.width!;
    mapConfig.height = img.height!;
    viewDimensions.scale = viewDimensions.height / img.height!;

    const mapWidth = Math.max(
      this.scaleValue(img.width!, viewDimensions.scale!),
      viewDimensions.width
    );

    img.scaleToWidth(this.scaleValue(img.width!, viewDimensions.scale!));
    img.scaleToHeight(this.scaleValue(img.height!, viewDimensions.scale!));
    img.set({ selectable: false, evented: false, objectCaching: false });

    canvas.setWidth(viewDimensions.width);
    canvas.setHeight(viewDimensions.height);
    canvas.setBackgroundImage(img, () => {});

    return { mapWidth };
  }

  /**
   * Scales a value based on the current scale factor
   */
  private scaleValue(value: number, scale: number): number {
    return value * scale;
  }
}
