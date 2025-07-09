import { Injectable, inject } from '@angular/core';
import { v4 as uuidV4 } from 'uuid';
import { fabric } from 'fabric';

import {
  ExtendedGroup,
  ExtendedObject,
  MapConfiguration,
  VenueMapType,
  Grade,
  GradeSetting,
  VenueMapTheme,
  Point,
} from './venue-map.type';
import { VenueMapCanvasService } from './venue-map-canvas.service';
import { VenueMapPriceService } from './venue-map-price.service';
import { scalePoints } from './venue-map.utils';
import {
  MULTIPLIER_GRADE_ICON,
} from './venue-map.constant';

/**
 * Service responsible for creating and managing venue grade visualizations.
 * Handles the creation of polygons, circles, and price sticky elements for grades.
 */
@Injectable({
  providedIn: 'root',
})
export class VenueMapGradeService {
  private readonly gradeIconMultiplier = MULTIPLIER_GRADE_ICON;
  private readonly canvasService = inject(VenueMapCanvasService);
  private readonly priceService = inject(VenueMapPriceService);

  /**
   * Creates a complete grade group containing polygon, circle, and sticky price elements.
   */
  public createGrade(
    polygon: fabric.Polygon,
    circle: ExtendedGroup,
    stickyPrice: ExtendedGroup,
    gradeInfo: Record<string, string | boolean>
  ): ExtendedGroup {
    const gradeGroup: ExtendedGroup = new fabric.Group(
      [polygon, circle, stickyPrice],
      {
        originX: 'center',
        originY: 'center',
        hoverCursor: 'pointer',
        selectable: false,
        hasBorders: false,
        perPixelTargetFind: true,
        evented: !gradeInfo['disabled'],
      }
    );

    gradeGroup.set({
      id: gradeInfo['id'].toString(),
      subId: uuidV4(),
      shapeIndex: Number(gradeInfo['shapeIndex']),
    });

    return gradeGroup;
  }

  /**
   * Creates and configures sticky elements for grade display based on map type.
   */
  public createGradeSticky(
    grade: Grade,
    gradeShape: ExtendedGroup,
    subId: string,
    mapType: VenueMapType
  ): void {
    if (!grade) return;

    gradeShape.getObjects().forEach(child => {
      if (child.type !== 'group') return;

      const targetChild = child as ExtendedGroup;
      this.renderStickyType(grade, targetChild, gradeShape, subId, mapType);

      if (subId === gradeShape.subId && mapType !== VenueMapType.GRADE) {
        this.renderShape(
          grade,
          targetChild,
          'circle',
          true,
          gradeShape,
          subId,
          mapType
        );
        this.renderShape(
          grade,
          targetChild,
          'stickyPrice',
          true,
          gradeShape,
          subId,
          mapType
        );
      }
    });
  }

  /**
   * Renders sticky elements based on map type.
   */
  private renderStickyType(
    grade: Grade,
    shape: ExtendedGroup,
    gradeShape: ExtendedGroup,
    subId: string,
    mapType: VenueMapType
  ): void {
    if (mapType === VenueMapType.GRADE) {
      this.renderShape(
        grade,
        shape,
        'circle',
        true,
        gradeShape,
        subId,
        mapType
      );
      this.renderShape(
        grade,
        shape,
        'stickyPrice',
        false,
        gradeShape,
        subId,
        mapType
      );
      return;
    }

    this.renderShape(grade, shape, 'circle', false, gradeShape, subId, mapType);
    this.renderShape(
      grade,
      shape,
      'stickyPrice',
      true,
      gradeShape,
      subId,
      mapType
    );
  }

  /**
   * Renders individual shape elements with visibility control.
   */
  private renderShape(
    grade: Grade,
    shape: ExtendedGroup,
    type: string,
    isVisible: boolean,
    gradeShape: ExtendedGroup | ExtendedObject,
    subId: string,
    mapType: VenueMapType
  ): void {
    if (type === shape.subType) {
      if (shape.subType === 'stickyPrice') {
        // Delegate price rendering to price service
        this.priceService.renderStickyPrice(
          grade,
          shape,
          isVisible,
          gradeShape as ExtendedGroup,
          subId,
          mapType
        );
      } else {
        // Handle other shape types (like circles)
        shape.set('opacity', isVisible ? 1 : 0);
      }
    }
  }

  /**
   * Creates a sticky price element for grade display.
   */
  public createStickyPrice(
    grade: Grade,
    gradeSetting: GradeSetting,
    mapInfo: MapConfiguration,
    theme: VenueMapTheme
  ): ExtendedGroup {
    return this.priceService.createStickyPrice(
      grade,
      gradeSetting,
      mapInfo,
      this.canvasService.viewDimensions.scale!,
      this.canvasService.canvas,
      theme
    );
  }

  /**
   * Creates a polygon shape for the grade area.
   */
  public createPolygon(
    gradeSetting: GradeSetting,
    disabled = false
  ): fabric.Polygon {
    const { points, color } = gradeSetting;
    const scaledPoints = scalePoints(points ?? [], this.canvasService.viewDimensions.scale!);

    this.renderGrade(points, color, disabled);

    return new fabric.Polygon(scaledPoints, {
      fill: color,
      stroke: undefined,
      strokeWidth: 0,
      opacity: 0.01,
      selectable: false,
      evented: !disabled,
      hoverCursor: 'pointer',
      originX: 'center',
      originY: 'center',
    });
  }

  /**
   * Renders a polygon with image color instead of rendering the actual image.
   */
  private renderGrade(
    points: Point[],
    color: string,
    disabled = false
  ): void {
    if (!points?.length) return;

    const imagePoints = scalePoints(points, this.canvasService.viewDimensions.scale!);

    const polygon = new fabric.Polygon(imagePoints, {
      fill: color,
      stroke: undefined,
      strokeWidth: 0,
      opacity: disabled ? 0.5 : 1,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
      globalCompositeOperation: disabled ? 'soft-light' : 'hard-light',
    });

    this.canvasService.canvas.add(polygon);
    this.canvasService.canvas.sendToBack(polygon);
  }

  /**
   * Creates a circle element for grade display.
   */
  public createCircle(
    grade: Grade,
    gradeSetting: GradeSetting,
    mapInfo: MapConfiguration,
    theme: VenueMapTheme
  ): ExtendedGroup {
    const resolvedTheme = theme;
    const { color, circle } = gradeSetting;
    const { circle: mapCircle, fontSize } = mapInfo;

    const circleShape = new fabric.Rect({
      fill: grade.disabled ? undefined : color,
      stroke: resolvedTheme.gradeStrokeColor,
      strokeWidth: this.canvasService.scaleValue(mapCircle.stroke),
      originX: 'center',
      originY: 'center',
      height: this.canvasService.scaleValue(
        mapCircle.height * this.gradeIconMultiplier
      ),
      width: this.canvasService.scaleValue(
        mapCircle.width * this.gradeIconMultiplier
      ),
      rx: this.canvasService.scaleValue(mapCircle.height),
      ry: this.canvasService.scaleValue(mapCircle.height),
    });

    const text = new fabric.Text(grade.abbreviation.toString(), {
      fontSize:
        this.canvasService.scaleValue(fontSize) * this.gradeIconMultiplier,
      fontFamily: 'Roboto',
      fontWeight: 700,
      top: 0,
      fill: circle.textColor,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    });

    const leftCircle = this.canvasService.scaleValue(circle.x);
    const topCircle = this.canvasService.scaleValue(circle.y);

    const groupCircle: ExtendedGroup = new fabric.Group(
      text ? [circleShape, text] : [circleShape],
      {
        left: leftCircle,
        top: topCircle,
        originX: 'center',
        originY: 'center',
        selectable: false,
        hoverCursor: 'pointer',
      }
    );

    groupCircle.set('subType', 'circle');

    return groupCircle;
  }
}
