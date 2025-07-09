import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
  input,
  output,
  signal,
  computed,
  effect,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { cloneDeep, debounce, merge } from 'lodash-es';
import { v4 as uuidV4 } from 'uuid';

import {
  ExtendedGroup,
  Grade,
  MapConfiguration,
  VenueMapType,
  VenueMapTheme,
  GradeSetting,
} from './venue-map.type';
import {
  DEFAULT_MAP_CONFIG,
  DEFAULT_VENUE_MAP_THEME,
} from './venue-map.constant';
import { SwitchComponent } from '../switch/switch.component';
import { VenueMapCanvasService } from './venue-map-canvas.service';
import { VenueMapGradeService } from './venue-map-grade.service';

const DEBOUNCE_DELAY = 250;
const MAP_FOCUS_DELAY = 1500;

interface GradeSelection {
  grade: Grade;
  shapeIndex: number | undefined;
}

interface FocusedGradePart {
  id: string;
  shapeIndex: number | undefined;
}

@Component({
  selector: 'ngx-venue-map',
  standalone: true,
  imports: [SwitchComponent, CommonModule, FormsModule],
  templateUrl: './venue-map.component.html',
  styleUrls: ['./venue-map.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class VenueMapComponent implements OnInit, AfterViewInit, OnDestroy {
  grades = input<Grade[]>([]);
  reloadMap = input<boolean>(true);
  focusedGradePart = input<FocusedGradePart | undefined>();
  mapConfiguration = input<
    (Partial<MapConfiguration> & Pick<MapConfiguration, 'width' | 'height' | 'path'>) | undefined
  >();
  theme = input<Partial<VenueMapTheme> | undefined>();

  // Signal Outputs (Angular 20 feature)
  selectGrade = output<GradeSelection>();

  // Template References
  @ViewChild('htmlCanvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('miniMap', { static: true })
  miniCanvasRef!: ElementRef<HTMLCanvasElement>;

  @ViewChild('mapContainer')
  mapContainer!: ElementRef<HTMLElement>;

  // Public Properties
  readonly VenueMapType = VenueMapType;

  // Signal-based State Management
  private readonly gradeService = inject(VenueMapGradeService);
  private readonly canvasService = inject(VenueMapCanvasService);

  // Computed Signals
  resolvedMapConfiguration = computed(() => {
    const config = this.mapConfiguration();
    const defaultMapConfiguration = cloneDeep(DEFAULT_MAP_CONFIG) as MapConfiguration;
    return merge(defaultMapConfiguration, config ?? {}) as MapConfiguration;
  });

  resolvedTheme = computed(() => {
    const themeConfig = this.theme();
    return merge(
      cloneDeep(DEFAULT_VENUE_MAP_THEME),
      themeConfig ?? {}
    ) as VenueMapTheme;
  });

  viewDimensions = computed(() => {
    const mapHeight = window.innerHeight;
    const config = this.resolvedMapConfiguration();
    return {
      width: this.mapWidth(),
      height: mapHeight,
      scale: mapHeight / config.height,
    };
  });

  // Signal State
  venueMapType = signal(VenueMapType.GRADE);
  isLoading = signal(false);
  mapWidth = signal(0);
  gradeSelectCanvas = signal<ExtendedGroup | undefined>(undefined);
  gradeSelect = signal<Grade | undefined>(undefined);

  // Private Properties
  private pendingMapWidth = 0;
  private isRendering = false;

  // Debounced Methods
  private readonly debounceGradeMapShow = debounce(
    () => this.renderGradeSticky(),
    DEBOUNCE_DELAY
  );

  private readonly debounceUpdateMapWidth = debounce(
    () => this.updateMapWidth(),
    DEBOUNCE_DELAY
  );

  constructor() {
    // Effect for grades changes
    effect(() => {
      const gradesValue = this.grades();
      const mapWidthValue = this.mapWidth();

      if (gradesValue.length > 0 && mapWidthValue > 0) {
        this.debounceUpdateMapWidth();
      }
    });

    // Effect for map configuration changes
    effect(() => {
      this.mapConfiguration(); // Track changes
      this.debounceUpdateMapWidth();
    });

    // Effect for theme changes
    effect(() => {
      this.theme(); // Track changes
      this.debounceUpdateMapWidth();
    });
  }

  // ============================================================================
  // LIFECYCLE METHODS
  // ============================================================================

  ngOnInit(): void {
    this.initializeCanvasHandlers();
  }

  ngOnDestroy(): void {
    this.cleanupResources();
  }

  ngAfterViewInit(): void {
    this.debounceUpdateMapWidth();
  }

  // ============================================================================
  // PRIVATE INITIALIZATION METHODS
  // ============================================================================

  /**
   * Initializes canvas event handlers and observables.
   */
  private initializeCanvasHandlers(): void {
    this.canvasService.getCanvasReadyObservable().subscribe();
    this.canvasService.setDebounceClickHandler(this.onGradeClick.bind(this));
  }

  /**
   * Cleans up resources when component is destroyed.
   */
  private cleanupResources(): void {
    this.canvasService.clearMapService();
    this.debounceGradeMapShow.cancel();
    this.debounceUpdateMapWidth.cancel();
  }

  // ============================================================================
  // MAP RENDERING AND MANAGEMENT METHODS
  // ============================================================================

  /**
   * Updates the map width and triggers re-rendering if needed.
   */
  private updateMapWidth(): void {
    if (!this.mapContainer?.nativeElement) return;

    const newMapWidth = this.mapContainer.nativeElement.offsetWidth;
    if (!newMapWidth) return;

    if (this.isRendering) {
      this.pendingMapWidth = newMapWidth;
      return;
    }

    this.startRenderProcess(newMapWidth);
  }

  /**
   * Starts the rendering process with the new map width.
   */
  private startRenderProcess(mapWidth: number): void {
    this.isRendering = true;
    this.mapWidth.set(mapWidth);
    this.processRenderQueue();
  }

  /**
   * Processes the render queue and handles pending width changes.
   */
  private async processRenderQueue(): Promise<void> {
    await this.handleMapSettingsChange();

    if (this.pendingMapWidth) {
      const nextMapWidth = this.pendingMapWidth;
      this.pendingMapWidth = 0;
      this.mapWidth.set(nextMapWidth);
      return this.processRenderQueue();
    }

    this.isRendering = false;
  }

  /**
   * Handles changes to map settings and triggers re-initialization.
   */
  private async handleMapSettingsChange(): Promise<void> {
    if (this.reloadMap()) {
      this.canvasService.removeCanvasMap();
    }

    this.initializeMapData();
    this.canvasService.initialize(
      this.viewDimensions(),
      this.resolvedMapConfiguration(),
      this.resolvedTheme()
    );
    this.setupCanvas();
    await this.resetAndRenderGrades();
  }

  /**
   * Initializes map data and view dimensions.
   */
  private initializeMapData(): void {
    // Data is now handled by computed signals
    // resolvedMapConfiguration and resolvedTheme are computed automatically
  }

  /**
   * Sets up the canvas and loads background image.
   */
  private setupCanvas(): void {
    if (this.reloadMap() || !this.canvasService.canvas) {
      this.canvasService.setupCanvas(this.canvasRef.nativeElement);
    }

    const config = this.resolvedMapConfiguration();
    this.canvasService.loadBackgroundImage(
      config.path,
    );
  }

  /**
   * Resets canvas state and renders all grades.
   */
  private async resetAndRenderGrades(): Promise<void> {
    this.isLoading.set(true);
    this.resetCanvasState();
    this.renderGrades();
    this.renderGradeSticky();

    await this.showCenterFocusMap();
    this.canvasService.showMap();
    this.isLoading.set(false);
  }

  /**
   * Resets the canvas state and clears selections.
   */
  private resetCanvasState(): void {
    this.canvasService.resetZoomCanvas();
    this.canvasService.resetHeightCanvas();
    this.canvasService.removeGroupCanvas();
    this.clearGradeSelection();
  }

  /**
   * Clears the current grade selection.
   */
  private clearGradeSelection(): void {
    this.gradeSelectCanvas.set(undefined);
    this.gradeSelect.set(undefined);
  }

  /**
   * Renders all grades on the canvas.
   */
  private renderGrades(): void {
    const grades = this.grades();
    grades.forEach(grade =>
      grade.settings.forEach((shape, index) => {
        const gradeGroup = this.createGradeGroup(grade, shape, index);
        this.canvasService.canvas.add(gradeGroup);
      })
    );
  }

  /**
   * Creates a grade group with all its components.
   */
  private createGradeGroup(
    grade: Grade,
    shape: GradeSetting,
    index: number
  ): ExtendedGroup {
    const gradeInfo = this.buildGradeInfo(grade, index);

    return this.gradeService.createGrade(
      this.gradeService.createPolygon(shape, grade.disabled),
      this.gradeService.createCircle(
        grade,
        shape,
        this.resolvedMapConfiguration(),
        this.resolvedTheme()
      ),
      this.gradeService.createStickyPrice(
        grade,
        shape,
        this.resolvedMapConfiguration(),
        this.resolvedTheme()
      ),
      gradeInfo
    );
  }

  /**
   * Builds grade information object for grade creation.
   */
  private buildGradeInfo(
    grade: Grade,
    index: number
  ): Record<string, string | boolean> {
    return {
      id: grade.id,
      subId: uuidV4(),
      shapeIndex: index.toString(),
      disabled: !!grade.disabled,
    };
  }

  /**
   * Renders sticky elements for all grades based on current map type.
   */
  private renderGradeSticky(): void {
    this.canvasService.canvas.getObjects().forEach(gradeShape => {
      const gradeShapeTyped = gradeShape as ExtendedGroup;
      const gradeId = gradeShapeTyped.id;

      if (gradeId) {
        const grade = this.findGradeById(gradeId);
        if (grade) {
          this.gradeService.createGradeSticky(
            grade,
            gradeShapeTyped,
            this.gradeSelectCanvas()?.subId ?? '',
            this.venueMapType()
          );
        }
      }
    });
  }

  /**
   * Finds a grade by its ID.
   */
  private findGradeById(gradeId: string): Grade | undefined {
    const grades = this.grades();
    return grades.find(grade => grade.id === gradeId);
  }

  // ============================================================================
  // MAP FOCUS AND INTERACTION METHODS
  // ============================================================================

  /**
   * Shows the center focus map with animation delay.
   */
  private async showCenterFocusMap(): Promise<void> {
    return new Promise<void>(resolve => {
      setTimeout(() => {
        this.renderMapFocus(resolve);
      }, MAP_FOCUS_DELAY);
    });
  }

  /**
   * Renders the map focus and initializes mini map.
   */
  private renderMapFocus(resolve: () => void): void {
    this.canvasService.initializeMiniMap(this.miniCanvasRef.nativeElement);
    this.canvasService.adjustViewToCenter(() => {
      resolve();
    });
  }

  /**
   * Handles grade click events.
   */
  private onGradeClick(selectedObject: ExtendedGroup): void {
    if (selectedObject?.type === 'group') {
      this.handleGradeSelection(selectedObject);
    }
  }

  /**
   * Handles the selection of a grade.
   */
  private handleGradeSelection(selectedGrade: ExtendedGroup): void {
    if (this.isGradeAlreadySelected(selectedGrade)) return;

    this.selectGradeInternal(selectedGrade);
    this.updateGradeDisplay();
  }

  /**
   * Updates the grade display after selection.
   */
  private updateGradeDisplay(): void {
    this.renderGradeSticky();
    this.canvasService.showDisplayViewportMap();
  }

  /**
   * Checks if the grade is already selected.
   */
  private isGradeAlreadySelected(selectedGrade: ExtendedGroup): boolean {
    const currentSelection = this.gradeSelectCanvas();
    return selectedGrade.subId === currentSelection?.subId;
  }

  /**
   * Selects a grade and updates the UI state.
   */
  private selectGradeInternal(selectedGrade: ExtendedGroup): void {
    this.canvasService.zoomToObjectBufferHeight(selectedGrade);

    const grade = this.findGradeById(selectedGrade.id ?? '');
    if (grade) {
      this.gradeSelect.set(cloneDeep(grade));
      this.gradeSelectCanvas.set(selectedGrade);
    }
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  /**
   * Gets the canvas service for template access.
   */
  get mapService() {
    return this.canvasService;
  }

  /**
   * Handles changes to grade map display.
   */
  public onChangeGradeMapShow(): void {
    this.cancelDebounceGradeMapShow();
    this.triggerDebounceGradeMapShow();
  }

  /**
   * Handles grade selection from external components.
   */
  public onGradeSelected(selectedObject: ExtendedGroup): void {
    const grade = this.findGradeById(selectedObject.id ?? '');
    if (!grade) return;

    const shapeIndex = selectedObject.shapeIndex;
    this.selectGrade.emit({ grade, shapeIndex });
  }

  /**
   * Handles seat grade selection.
   */
  public onSelectSeatGrade(): void {
    const currentGrade = this.gradeSelect();
    const currentCanvas = this.gradeSelectCanvas();

    if (!currentGrade || !currentCanvas) return;

    const shapeIndex = currentCanvas.shapeIndex;
    this.selectGrade.emit({ grade: currentGrade, shapeIndex });
  }

  /**
   * Handles changes to grade map type (grade view vs price view).
   */
  public onChangeGradeMapType(isPrice: boolean): void {
    this.venueMapType.set(isPrice
      ? VenueMapType.GRADE_PRICE
      : VenueMapType.GRADE);
    this.onChangeGradeMapShow();
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Cancels the debounced grade map show operation.
   */
  private cancelDebounceGradeMapShow(): void {
    this.debounceGradeMapShow.cancel();
  }

  /**
   * Triggers the debounced grade map show operation.
   */
  private triggerDebounceGradeMapShow(): void {
    this.debounceGradeMapShow();
  }
}
