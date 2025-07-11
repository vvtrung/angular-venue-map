import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { throttle, debounce } from 'lodash-es';
import { BehaviorSubject } from 'rxjs';
import { fabric } from 'fabric';

import {
  ClientPositionSeat,
  ExtendedObject,
  ExtendedGroup,
  FabricCanvas,
  MapSetting,
  MapConfiguration,
  Bounds,
  Point,
  VenueMapTheme,
} from './venue-map.type';
import { VenueMapRenderService } from './venue-map-render.service';
import { VenueMapMiniMapService } from './venue-map-mini-map.service';
import { scaleValue, scalePoint, scalePoints } from './venue-map.utils';

// ============================================================================
// INTERFACES & CONSTANTS
// ============================================================================

interface ZoomInfo {
  max: number;
  min: number;
}

interface TouchState {
  isTouching: boolean;
  isDragging: boolean;
  isPinching: boolean;
  isZooming: boolean;
  isMoving: boolean;
  pausePanning: boolean;
}

interface Position {
  x: number;
  y: number;
}

// Constants
const LONG_TOUCH_DURATION = 200;
const ZOOM_THRESHOLD = 1.2;
const CLICK_THRESHOLD = 5;
const ZOOM_ANIMATION_DURATION = 500;
const DEBOUNCE_DELAY = 250;
const THROTTLE_DELAY = 100;

@Injectable({
  providedIn: 'root',
})
export class VenueMapCanvasService {
  // ============================================================================
  // INJECTED SERVICES
  // ============================================================================

  private readonly renderService = inject(VenueMapRenderService);
  private readonly miniMapService = inject(VenueMapMiniMapService);

  // ============================================================================
  // SIGNAL-BASED STATE MANAGEMENT (Angular 20)
  // ============================================================================

  // Canvas state signals
  private readonly canvasReady$ = new BehaviorSubject<boolean>(false);

  // Public signal state
  readonly zoomLevel = signal(1);
  readonly isZooming = signal(false);
  readonly canvasReady = signal(false);

  // Computed signals for getters
  readonly disableZoomIn = computed(() =>
    this.zoomLevel() >= this.mapConfig?.zoom.max
  );

  readonly disableZoomOut = computed(() =>
    this.zoomLevel() <= this.mapConfig?.zoom.min
  );

  readonly showMiniMap = computed(() =>
    this.zoomLevel() >= this.mapConfig?.zoom.showMiniMapAtLevel
);

  // ============================================================================
  // PRIVATE PROPERTIES
  // ============================================================================

  // Touch and interaction state
  private touchState: TouchState = {
    isTouching: false,
    isDragging: false,
    isPinching: false,
    isZooming: false,
    isMoving: false,
    pausePanning: false,
  };

  private touchTimeout?: ReturnType<typeof setTimeout>;
  private animationFrameId: number | null = null;
  private currentPosition: Position = { x: 0, y: 0 };
  private lastPosition: Position = { x: 0, y: 0 };
  private lastTouchEventTimestamp = 0;
  private zoomStartScale = 0;
  private lastScale = 0;
  private mapWidth = 0;

  // Event handlers
  private debouncedClickHandler!: ((object: ExtendedGroup) => void) & {
    cancel: () => void;
  };
  private debounceClick?: (object: ExtendedGroup, touch?: MouseEvent) => void;
  private workerRenderValue?: () => void;

  // ============================================================================
  // PUBLIC PROPERTIES
  // ============================================================================

  clientPopupPosition!: ClientPositionSeat;
  miniMapCanvas!: fabric.StaticCanvas;
  viewDimensions!: MapSetting;
  canvas!: FabricCanvas;
  mapConfig!: MapConfiguration;
  theme!: VenueMapTheme;

  constructor() {
    // Effect to sync zoom level with canvas zoom
    effect(() => {
      if (this.canvas) {
        const currentZoom = this.canvas.getZoom();
        if (currentZoom !== this.zoomLevel()) {
          this.zoomLevel.set(currentZoom);
        }
      }
    });

    // Effect to sync canvas ready state
    effect(() => {
      this.canvasReady$.next(this.canvasReady());
    });
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Updates the zoom level signal and triggers reactive updates
   */
  private updateZoomLevel(zoom: number): void {
    this.zoomLevel.set(zoom);
  }

  // ============================================================================
  // PUBLIC METHODS - INITIALIZATION
  // ============================================================================
  getCanvasReadyObservable() {
    return this.canvasReady$.asObservable();
  }

  initialize(
    viewDimensions: MapSetting,
    config: MapConfiguration,
    theme: VenueMapTheme
  ): void {
    this.viewDimensions = viewDimensions;
    this.mapConfig = config;
    this.theme = theme;
  }

  public setupCanvas(canvasElement: HTMLCanvasElement): void {
    this.canvas = new fabric.Canvas(canvasElement, {
      selection: false,
      backgroundColor: this.theme.canvasBackgroundColor,
      renderOnAddRemove: false,
      stateful: false,
    }) as FabricCanvas;

    this.hiddenMap();
    this.setupEventListeners();
  }

  public hiddenMap(): void {
    if (!this.canvas) return;

    this.canvas.getElement().style.visibility = 'hidden';
    this.canvas.renderOnAddRemove = false;
  }

  // ============================================================================
  // PRIVATE METHODS - EVENT SETUP
  // ============================================================================

  private setupEventListeners(): void {
    this.canvas.on(
      'mouse:wheel',
      throttle(e => this.handleZoom(e), THROTTLE_DELAY)
    );
    this.canvas.on(
      'touch:gesture',
      throttle(e => this.handleGesture(e), THROTTLE_DELAY)
    );
    this.canvas.on(
      'selection:created',
      () => (this.touchState.pausePanning = true)
    );
    this.canvas.on(
      'selection:cleared',
      () => (this.touchState.pausePanning = false)
    );
    this.canvas.on('touch:drag', e => this.handleDrag(e));
    this.canvas.on('mouse:down', options => this.handleMouseDown(options));
    this.canvas.on(
      'mouse:move',
      throttle(options => this.handleMouseMove(options), 50)
    );
    this.canvas.on('mouse:up', options => this.handleMouseUp(options));

    const wrapperEl = this.canvas.wrapperEl;
    if (wrapperEl) {
      wrapperEl.addEventListener(
        'touchstart',
        this.handleTouchStart.bind(this),
        {
          passive: false,
        }
      );
      wrapperEl.addEventListener('touchmove', this.handleTouchMove.bind(this), {
        passive: false,
      });
      wrapperEl.addEventListener('touchend', this.handleTouchEnd.bind(this), {
        passive: false,
      });
    }
  }

  // ============================================================================
  // PRIVATE METHODS - TOUCH EVENT HANDLERS
  // ============================================================================

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    this.cancelDebounceClick?.();

    this.touchState.isTouching = true;
    if (e.touches.length >= 2) {
      this.touchState.pausePanning = true;
      this.touchState.isZooming = true;
      this.touchState.isPinching = true;
      this.isZooming.set(true);
      this.touchState.isDragging = false;
      this.zoomStartScale = this.getDistance(e.touches[0], e.touches[1]);

      return;
    }

    this.lastPosition = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
    this.touchTimeout = setTimeout(() => {
      if (this.touchState.isTouching && !this.touchState.isPinching) {
        this.touchState.isDragging = true;
        this.cancelDebounceClick?.();
      }
    }, LONG_TOUCH_DURATION);
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();

    if (e.touches.length >= 2) {
      this.handlePinchZoom(e);

      return;
    }

    this.handleSingleTouchMove(e);
  }

  private handlePinchZoom(e: TouchEvent): void {
    const zoomFactor = 0.5;
    const smoothingFactor = 0.5;

    this.cancelDebounceClick?.();

    if (!this.touchState.isPinching) {
      this.touchState.isPinching = true;
      this.zoomStartScale = this.getDistance(e.touches[0], e.touches[1]);
      return;
    }

    this.touchState.isDragging = false;
    const now = Date.now();
    if (now - this.lastTouchEventTimestamp < 50) return;

    this.lastTouchEventTimestamp = now;
    const distance = this.getDistance(e.touches[0], e.touches[1]);
    let scale = distance / (this.zoomStartScale || distance);
    scale = 1 + (scale - 1) * zoomFactor;
    const zoomConfig = this.mapConfig.zoom;
    scale = Math.max(zoomConfig.min, Math.min(zoomConfig.max, scale));

    if (this.lastScale) {
      scale = this.lastScale + (scale - this.lastScale) * smoothingFactor;
    }
    this.lastScale = scale;

    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

    const rect = this.canvas.wrapperEl.getBoundingClientRect();
    const point = new fabric.Point(centerX - rect.left, centerY - rect.top);

    let zoom = this.canvas.getZoom() * scale;
    zoom = Math.max(zoomConfig.min, Math.min(zoomConfig.max, zoom));
    this.canvas.zoomToPoint(point, zoom);
    this.updateZoomLevel(zoom);
    this.showDisplayViewportMap();

    if (zoom > zoomConfig.min && zoom < zoomConfig.max) {
      this.zoomStartScale = distance;
    }
  }

  private handleSingleTouchMove(e: TouchEvent): void {
    if (!this.touchState.pausePanning && !this.touchState.isPinching) {
      this.cancelDebounceClick?.();
      if (this.touchTimeout) clearTimeout(this.touchTimeout);
      const touch = e.touches[0];
      const xChange = touch.clientX - this.lastPosition.x;
      const yChange = touch.clientY - this.lastPosition.y;

      if (Math.abs(xChange) > 5 || Math.abs(yChange) > 5) {
        this.touchState.isDragging = true;
        const delta = new fabric.Point(xChange, yChange);
        this.canvas.relativePan(delta);
        this.lastPosition = { x: touch.clientX, y: touch.clientY };
        this.showDisplayViewportMap();
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();
    this.cancelDebounceClick?.();

    if (this.touchTimeout) clearTimeout(this.touchTimeout);
    this.touchState.isTouching = false;

    if (this.touchState.isPinching && e.touches.length < 2) {
      const touch = e.touches[0];
      this.lastPosition = { x: touch.clientX, y: touch.clientY };
    }

    if (
      !this.touchState.isDragging &&
      !this.touchState.isPinching &&
      !this.touchState.isZooming &&
      e.changedTouches.length === 1
    ) {
      const touch = e.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target instanceof HTMLElement) {
        const fabricObject = this.canvas.findTarget(e, false) as ExtendedGroup;
        this.debounceClick?.(fabricObject, touch as unknown as MouseEvent);
      }
    }
    this.resetActionEvent();
  }

  private resetActionEvent(): void {
    this.zoomStartScale = 0;
    this.touchState.isMoving = false;
    this.touchState.isDragging = false;
    if (
      this.touchState.isPinching ||
      this.isZooming() ||
      this.touchState.pausePanning ||
      this.touchState.isDragging
    ) {
      setTimeout(() => {
        this.touchState.pausePanning = false;
        this.isZooming.set(false);
        this.touchState.isPinching = false;
      }, 150);
    }
  }

  // ============================================================================
  // PRIVATE METHODS - MOUSE EVENT HANDLERS
  // ============================================================================

  private handleMouseDown(options: fabric.IEvent): void {
    this.cancelDebounceClick?.();

    this.touchState.isTouching = true;
    const mouseEvent = options.e as MouseEvent;
    this.lastPosition = { x: mouseEvent.clientX, y: mouseEvent.clientY };

    this.touchTimeout = setTimeout(() => {
      if (this.touchState.isTouching) {
        this.touchState.isMoving = true;
        this.cancelDebounceClick?.();
      }
    }, LONG_TOUCH_DURATION);
  }

  private handleMouseUp(options: fabric.IEvent): void {
    const mouseEvent = options.e as MouseEvent;
    this.touchState.isTouching = false;

    if (
      Math.abs(mouseEvent.movementX) <= CLICK_THRESHOLD &&
      Math.abs(mouseEvent.movementY) <= CLICK_THRESHOLD &&
      !this.touchState.isMoving &&
      !this.touchState.isPinching &&
      !this.touchState.isDragging
    ) {
      const selectedObject = options.target as ExtendedGroup;
      this.cancelDebounceClick?.();
      this.debounceClick?.(selectedObject, options.e as MouseEvent);
    }

    this.resetActionEvent();
  }

  private handleMouseMove(options: fabric.IEvent): void {
    if (
      !this.touchState.isMoving ||
      this.touchState.isPinching ||
      this.isZooming()
    )
      return;

    const client = this.getClientPosition(options);
    const xChange = client.x - this.lastPosition.x;
    const yChange = client.y - this.lastPosition.y;

    if (Math.abs(xChange) > 5 || Math.abs(yChange) > 5) {
      const delta = new fabric.Point(xChange, yChange);
      this.canvas.relativePan(delta);
      this.lastPosition = client;
      this.showDisplayViewportMap();
    }
  }

  private handleZoom(event: fabric.IEvent): void {
    this.cancelDebounceClick?.();
    if (this.isZooming()) return;

    const e = event.e as WheelEvent;
    let zoom = this.canvas.getZoom();
    zoom *= 0.999 ** e.deltaY;
    const zoomConfig = this.mapConfig.zoom;
    zoom = Math.max(zoomConfig.min, Math.min(zoomConfig.max, zoom));

    this.canvas.zoomToPoint(new fabric.Point(e.offsetX, e.offsetY), zoom);
    this.updateZoomLevel(zoom);

    this.showDisplayViewportMap();

    e.preventDefault();
    e.stopPropagation();
  }

  private handleGesture(event: fabric.IEvent): void {
    const e = event.e as TouchEvent;
    const zoomFactor = 0.5;

    if (!e.touches || e.touches.length !== 2) return;

    this.touchState.pausePanning = true;
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    const distance = Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
    );

    if (!this.zoomStartScale) {
      this.zoomStartScale = distance;
    } else {
      const centerX = (touch1.clientX + touch2.clientX) / 2;
      const centerY = (touch1.clientY + touch2.clientY) / 2;
      const point = new fabric.Point(centerX, centerY);
      let scale = distance / this.zoomStartScale;
      scale = 1 + (scale - 1) * zoomFactor;
      this.zoomStartScale = distance;
      let zoom = this.canvas.getZoom() * scale;
      const zoomConfig = this.mapConfig.zoom;
      zoom = Math.max(zoomConfig.min, Math.min(zoomConfig.max, zoom));
      this.canvas.zoomToPoint(point, zoom);
    }

    e.preventDefault();
    e.stopPropagation();
  }

  private handleDrag(event: fabric.IEvent): void {
    const e = event.e as TouchEvent;

    if (
      this.touchState.pausePanning ||
      !e.touches ||
      e.touches.length === 0 ||
      this.isZooming()
    )
      return;

    e.preventDefault();
    const touch = e.touches[0];
    this.currentPosition = { x: touch.clientX, y: touch.clientY };
    const xChange = this.currentPosition.x - this.lastPosition.x;
    const yChange = this.currentPosition.y - this.lastPosition.y;

    if (Math.abs(xChange) <= 50 && Math.abs(yChange) <= 50) {
      const delta = new fabric.Point(xChange, yChange);
      this.canvas.relativePan(delta);
    }

    this.lastPosition = this.currentPosition;
  }

  // ============================================================================
  // PUBLIC METHODS - IMAGE MANAGEMENT
  // ============================================================================

  public loadBackgroundImage(
    pathImg?: string | string[],
    callback?: () => void
  ): void {
    if (!this.canvas) return;

    this.renderService.loadBackgroundImage(
      this.canvas,
      this.mapConfig,
      this.viewDimensions,
      pathImg,
      (mapWidth: number) => {
        this.mapWidth = mapWidth;
        this.renderFrame();
        this.canvasReady.set(true);
        callback?.();
      }
    );
  }

  // ============================================================================
  // PUBLIC METHODS - RENDERING
  // ============================================================================

  public renderFrame(): void {
    this.workerRenderValue?.() ?? this.canvas?.renderAll();
    this.animationFrameId = requestAnimationFrame(() => this.renderFrame());
  }

  private stopRenderFrame(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  showMap(): void {
    this.canvas.getElement().style.visibility = 'visible';
    this.canvas.renderOnAddRemove = true;
  }

  // ============================================================================
  // PUBLIC METHODS - MINIMAP
  // ============================================================================

  public initializeMiniMap(): void {
    if (!this.canvas) return;

    this.miniMapCanvas = this.miniMapService.initializeMiniMap(
      this.mapWidth,
      {
        width: this.viewDimensions.width,
        height: this.viewDimensions.height,
        scale: this.viewDimensions.scale || 1
      },
      this.mapConfig
    );

    this.miniMapService.renderMiniMap(this.canvas);
    this.showDisplayViewportMap();
  }

  public showDisplayViewportMap(): void {
    if (!this.canvas || !this.miniMapCanvas) return;

    this.miniMapService.showViewportRect(
      this.canvas.viewportTransform,
      this.canvas.getWidth(),
      this.canvas.getHeight(),
      this.canvas.getZoom(),
      {
        width: this.viewDimensions.width,
        height: this.viewDimensions.height,
        scale: this.viewDimensions.scale || 1
      },
      this.mapConfig,
      this.theme
    );
  }

  // ============================================================================
  // PUBLIC METHODS - ZOOM & NAVIGATION
  // ============================================================================

  public zoomAnimated(
    point: fabric.Point,
    zoomLevel: number,
    duration = ZOOM_ANIMATION_DURATION,
    callback?: () => void
  ): void {
    if (this.isZooming() || !this.canvas) return;

    this.isZooming.set(true);
    const canvas = this.canvas;
    const startZoom = canvas.getZoom();
    const endZoom = zoomLevel;
    const startPoint = canvas.getVpCenter();
    const endPoint = new fabric.Point(point.x, point.y);

    const vpw = canvas.getWidth();
    const vph = canvas.getHeight();

    const throttledUpdate = throttle((value: number) => {
      const zoom = startZoom + (endZoom - startZoom) * value;
      canvas.setZoom(zoom);
      this.updateZoomLevel(zoom);

      const newX = startPoint.x + (endPoint.x - startPoint.x) * value;
      const newY = startPoint.y + (endPoint.y - startPoint.y) * value;

      const currentZoom = zoom;
      const viewportWidth = vpw / currentZoom;
      const viewportHeight = vph / currentZoom;

      const x = newX - viewportWidth / 2;
      const y = newY - viewportHeight / 2;

      canvas.setViewportTransform([zoom, 0, 0, zoom, -x * zoom, -y * zoom]);
      this.showDisplayViewportMap();
    }, 16);

    fabric.util.animate({
      startValue: 0,
      endValue: 1,
      duration: duration,
      onChange: value => {
        throttledUpdate(value);
      },
      onComplete: () => {
        this.isZooming.set(false);
        callback?.();
      },
    });
  }

  adjustViewToCenter(callback?: () => void, widthPercentage = 0.9): void {
    const { width, height } = this.viewDimensions;
    const centerPoint = this.centerPointCanvas();

    const zoomLevel =
      width < height
        ? width / this.mapWidth
        : height / this.scaleValue(this.mapConfig.height ?? 0);

    this.zoomAnimated(centerPoint, zoomLevel * widthPercentage);

    setTimeout(() => {
      callback?.();
    }, 550);
  }

  public resetZoomCanvas(): void {
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.canvas.setZoom(1);
    this.updateZoomLevel(1);
    this.showDisplayViewportMap();
  }

  public handleZoomBtn(type: 'zoomIn' | 'zoomOut'): void {
    if (!this.canvas) return;

    const currentZoom = this.canvas.getZoom();
    const viewportTransform = this.canvas.viewportTransform || [1, 0, 0, 1, 0, 0];

    // Calculate the center of the current viewport
    const canvasWidth = this.canvas.getWidth();
    const canvasHeight = this.canvas.getHeight();

    const viewportCenterX = -viewportTransform[4] / currentZoom + canvasWidth / (2 * currentZoom);
    const viewportCenterY = -viewportTransform[5] / currentZoom + canvasHeight / (2 * currentZoom);

    const centerPoint = new fabric.Point(viewportCenterX, viewportCenterY);

    const zoomStepValue = this.mapConfig.zoom.step;
    const zoomStep = zoomStepValue * currentZoom;
    const targetZoom =
      type === 'zoomIn' ? currentZoom + zoomStep : currentZoom - zoomStep;

    this.zoomAnimated(centerPoint, targetZoom);
  }

  public zoomAndPanToObject(
    object: ExtendedObject,
    zoom = ZOOM_THRESHOLD,
    callback?: () => void
  ): void {
    const targetObject: ExtendedObject = object;
    const objectCenter = targetObject.getCenterPoint();
    this.zoomAnimated(objectCenter, zoom, ZOOM_ANIMATION_DURATION, callback);
  }

  public zoomToObjectBufferHeight(
    object: ExtendedObject,
    zoom = ZOOM_THRESHOLD,
    heightPrice = 0,
    callback?: () => void
  ): void {
    const targetObject: ExtendedObject = object;
    const objectCenter = targetObject.getCenterPoint();
    const heightBuffer = this.viewDimensions.height * 0.3;
    objectCenter.setY(objectCenter.y + (heightBuffer + heightPrice) / 2);
    this.zoomAnimated(objectCenter, zoom, ZOOM_ANIMATION_DURATION, callback);
  }

  // ============================================================================
  // PUBLIC METHODS - CANVAS MANAGEMENT
  // ============================================================================

  public resetHeightCanvas(): void {
    this.canvas.setHeight(this.viewDimensions.height);
  }

  public setHeightCanvas(heightBuffer = 0): void {
    this.canvas.setHeight(this.viewDimensions.height + heightBuffer);
  }

  public centerPointCanvas(): fabric.Point {
    const { width, height } = this.mapConfig;

    return new fabric.Point(
      this.scaleValue(width / 2),
      this.scaleValue(height / 2)
    );
  }

  public removeGroupCanvas(): void {
    const objects = this.canvas.getObjects();
    const miniMapObjects = this.miniMapCanvas?.getObjects() ?? [];
    for (let i = objects.length - 1; i >= 0; i--) {
      this.canvas.remove(objects[i]);
    }
    for (let i = miniMapObjects.length - 1; i >= 0; i--) {
      this.miniMapCanvas.remove(miniMapObjects[i]);
    }
  }

  public createObjectFromPoint(point: Point): ExtendedGroup {
    const selectedObject = new fabric.Object({
      left: point.x,
      top: point.y,
      width: 1,
      height: 1,
    }) as ExtendedGroup;

    return selectedObject;
  }

  public findObjectByGrade(
    id?: string,
    shapeIndex?: number
  ): ExtendedGroup | undefined {
    if (!id || typeof shapeIndex !== 'number') return;

    const selectedObject = this.canvas
      .getObjects()
      .find(
        (obj: ExtendedObject) => obj.id === id && obj.shapeIndex === shapeIndex
      );
    return selectedObject as ExtendedGroup;
  }

  removeObjectCaching(): void {
    this.canvas?.getObjects().forEach(obj => {
      obj.set('objectCaching', false);
    });
  }

  // ============================================================================
  // PUBLIC METHODS - EVENT HANDLERS
  // ============================================================================

  setDebounceClickHandler(
    handler: (object: ExtendedGroup, touch?: MouseEvent) => void
  ): void {
    this.debouncedClickHandler = debounce(handler, DEBOUNCE_DELAY);
    this.debounceClick = this.debouncedClickHandler;
  }

  setWorkerRenderValue(handler: () => void): void {
    this.workerRenderValue = handler;
  }

  private cancelDebounceClick(): void {
    this.debouncedClickHandler?.cancel();
  }

  // ============================================================================
  // PUBLIC METHODS - UTILITY
  // ============================================================================

  public scaleValue(value: number): number {
    return scaleValue(value, this.viewDimensions.scale!);
  }

  public scalePoint(point: { x: number; y: number }): { x: number; y: number } {
    return scalePoint(point, this.viewDimensions.scale!);
  }

  public handleScalePoint(
    points: { x: number; y: number }[]
  ): { x: number; y: number }[] {
    return scalePoints(points, this.viewDimensions.scale!);
  }

  public scalePointGrade(
    point: { x: number; y: number },
    mapConfigGrade: MapConfiguration
  ): { x: number; y: number } {
    const scaleMap = this.mapConfig.width / mapConfigGrade.width;
    return {
      x: point.x * scaleMap * this.viewDimensions.scale!,
      y: point.y * scaleMap * this.viewDimensions.scale!,
    };
  }

  public calculateFramesDimensions(points?: Point[]) {
    if (!points || points.length < 3) {
      return {
        width: 1,
        height: 1,
        left: 1,
        top: 1,
        right: 1,
        bottom: 1,
        centerX: 1,
        centerY: 1,
      };
    }

    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    return {
      width,
      height,
      left: minX,
      top: minY,
      right: maxX,
      bottom: maxY,
      centerX,
      centerY,
    };
  }

  public getVisibleBounds(buffer = 0): Bounds {
    if (!this.canvas) {
      return { left: 0, top: 0, right: 0, bottom: 0, zoom: 1 };
    }

    const zoom = this.canvas.getZoom();
    const vpt = this.canvas.viewportTransform;

    return {
      left: -(vpt?.[4] ?? 0) / zoom - buffer,
      top: -(vpt?.[5] ?? 0) / zoom - buffer,
      right: (this.canvas.width ?? 0) / zoom - (vpt?.[4] ?? 0) / zoom + buffer,
      bottom:
        (this.canvas.height ?? 0) / zoom - (vpt?.[5] ?? 0) / zoom + buffer,
      zoom,
    };
  }

  public isInBounds(
    seatPoint: { left: number; top: number },
    bounds: Bounds
  ): boolean {
    return (
      seatPoint.left >= bounds.left &&
      seatPoint.left <= bounds.right &&
      seatPoint.top >= bounds.top &&
      seatPoint.top <= bounds.bottom
    );
  }

  private getClientPosition(options: fabric.IEvent): Position {
    let clientX, clientY;

    if (options.e.type.startsWith('touch')) {
      const touch =
        (options.e as TouchEvent).touches[0] ||
        (options.e as TouchEvent).changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      const mouseEvent = options.e as MouseEvent;
      clientX = mouseEvent.clientX;
      clientY = mouseEvent.clientY;
    }

    return { x: clientX, y: clientY };
  }

  private getDistance(touch1: Touch, touch2: Touch): number {
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  }

  // ============================================================================
  // CLEANUP METHODS
  // ============================================================================

  private removeEventListeners(): void {
    if (!this.canvas) return;

    this.canvas.off('mouse:wheel');
    this.canvas.off('touch:gesture');
    this.canvas.off('selection:created');
    this.canvas.off('selection:cleared');
    this.canvas.off('touch:drag');
    this.canvas.off('mouse:down');
    this.canvas.off('mouse:move');
    this.canvas.off('mouse:up');

    if (this.canvas.wrapperEl) {
      this.canvas.wrapperEl.removeEventListener(
        'touchstart',
        this.handleTouchStart as EventListener
      );
      this.canvas.wrapperEl.removeEventListener(
        'touchmove',
        this.handleTouchMove as EventListener
      );
      this.canvas.wrapperEl.removeEventListener(
        'touchend',
        this.handleTouchEnd as EventListener
      );
    }
  }

  public removeCanvasMap(): void {
    if (this.canvas) {
      this.canvas.clear();
      this.canvas.dispose();
      this.canvas = undefined!;
    }

    if (this.miniMapCanvas) {
      this.miniMapCanvas.clear();
      this.miniMapCanvas.dispose();
      this.miniMapCanvas = undefined!;
    }
    this.stopRenderFrame();
  }

  clearMapService(): void {
    this.removeEventListeners();
    this.removeCanvasMap();
    this.stopRenderFrame();
    this.miniMapService.cleanup();
  }
}
