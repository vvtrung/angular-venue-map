import { Injectable } from '@angular/core';
import { fabric } from 'fabric';

import {
  ExtendedGroup,
  Grade,
  GradeSetting,
  MapConfiguration,
  VenueMapTheme,
  VenueMapType,
} from './venue-map.type';
import { scaleValue } from './venue-map.utils';

/**
 * Service responsible for creating and managing price displays on venue maps.
 * Handles the creation of sticky price elements and price-related rendering logic.
 */
@Injectable({
  providedIn: 'root',
})
export class VenueMapPriceService {
  /**
   * Finds the circle element within a grade shape.
   */
  private findCircleInGradeShape(gradeShape: ExtendedGroup): fabric.Object | undefined {
    return gradeShape
      .getObjects()
      .find(
        obj =>
          obj.type === 'group' && (obj as ExtendedGroup).subType === 'circle'
      );
  }

  /**
   * Calculates the height offset for circle elements.
   */
  private calculateCircleHeight(
    subId: string,
    gradeShape: ExtendedGroup,
    mapType: VenueMapType,
    circle?: fabric.Object
  ): number {
    return subId === gradeShape?.subId && mapType !== VenueMapType.GRADE
      ? (circle?.getScaledHeight() ?? 0) / 2
      : 0;
  }

  /**
   * Finds the text bubble group within a shape.
   */
  private findTextBubbleGroup(shape: ExtendedGroup): fabric.Object | undefined {
    return shape.getObjects().find(obj => obj.type === 'group');
  }

  /**
   * Calculates the position for sticky price elements.
   */
  private calculateStickyPosition(
    circle?: fabric.Object,
    circleHeight = 0,
    textBubbleGroup?: fabric.Object
  ): { left?: number; top: number } {
    return {
      left: circle?.left,
      top:
        (circle?.top ?? 0) -
        circleHeight -
        (textBubbleGroup?.getScaledHeight() ?? 0),
    };
  }

  /**
   * Updates the content of text bubble elements.
   */
  private updateTextBubbleContent(grade: { price: number }, shape: ExtendedGroup): void {
    shape.getObjects().forEach(obj => {
      const objGroup = obj as ExtendedGroup;
      if (objGroup.subType === 'textBubbleGroup') {
        this.updateTextContent(objGroup, grade);
      }
    });
  }

  /**
   * Updates the text content within a text bubble group.
   */
  private updateTextContent(
    textBubbleGroup: ExtendedGroup,
    grade: { price: number }
  ): void {
    textBubbleGroup.getObjects().forEach(textBubble => {
      if (textBubble.type === 'text') {
        (textBubble as fabric.Text).set(
          'text',
          Number(grade.price).toLocaleString()
        );
      }
    });
  }
  /**
   * Creates a sticky price element for grade display.
   */
  public createStickyPrice(
    grade: Grade,
    gradeSetting: GradeSetting,
    mapInfo: MapConfiguration,
    scale: number,
    canvas: fabric.Canvas,
    theme: VenueMapTheme
  ): ExtendedGroup {
    const { fontSize, bubble, corner, arrow } = mapInfo;
    const { circle } = gradeSetting;

    const leftCircle = scaleValue(circle.x, scale);
    const topCircle = scaleValue(circle.y, scale);
    const price = Number(grade.price);

    const priceText = new fabric.Text(price.toLocaleString(), {
      fontSize: scaleValue(fontSize, scale),
      fontFamily: 'Arial',
      fontWeight: 'bold',
      fill: theme.priceTextColor,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
    });

    priceText.set('type', 'text');
    canvas.add(priceText);
    priceText.setCoords();

    const bubbleRect = new fabric.Rect({
      width:
        priceText.getScaledWidth() +
        scaleValue(bubble.width, scale),
      height:
        priceText.getScaledHeight() +
        scaleValue(bubble.height, scale),
      fill: grade.disabled ? undefined : theme.priceBackgroundColor,
      stroke: theme.priceBubbleStrokeColor,
      rx: scaleValue(corner.width, scale),
      ry: scaleValue(corner.width, scale),
      originX: 'center',
      originY: 'center',
    });

    canvas.remove(priceText);

    const arrowRect = new fabric.Triangle({
      width: scaleValue(arrow.width, scale),
      height: scaleValue(arrow.height, scale),
      fill: grade.disabled ? undefined : theme.priceBackgroundColor,
      stroke: theme.priceBubbleStrokeColor,
      originX: 'center',
      originY: 'top',
      left: bubbleRect.left,
      top:
        (bubbleRect.top ?? 0) +
        (bubbleRect.height ?? 0) / 2 +
        scaleValue(arrow.padding, scale),
      angle: 180,
    });

    const textBubbleGroup: ExtendedGroup = new fabric.Group(
      [bubbleRect, priceText],
      {
        originX: 'center',
        originY: 'center',
      }
    );

    textBubbleGroup.set('subType', 'textBubbleGroup');

    const positionStick = {
      left: leftCircle,
      top: topCircle - textBubbleGroup.getScaledHeight(),
    };

    const stickyPrice: ExtendedGroup = new fabric.Group(
      [textBubbleGroup, arrowRect],
      {
        ...positionStick,
        originX: 'center',
        originY: 'top',
        opacity: 0,
      }
    );

    const shadowOptions = {
      color: theme.shadowColor,
      blur: 2,
      offsetX: 0.5,
      offsetY: 0.5,
    };
    stickyPrice.set('shadow', new fabric.Shadow(shadowOptions));
    stickyPrice.set('subType', 'stickyPrice');

    return stickyPrice;
  }

  /**
   * Updates the position of sticky price elements.
   */
  public updateStickyPricePosition(
    grade: Grade,
    shape: ExtendedGroup,
    gradeShape: ExtendedGroup,
    subId: string,
    mapType: VenueMapType
  ): void {
    const circle = this.findCircleInGradeShape(gradeShape);
    const circleHeight = this.calculateCircleHeight(
      subId,
      gradeShape,
      mapType,
      circle
    );
    const textBubbleGroup = this.findTextBubbleGroup(shape);

    const position = this.calculateStickyPosition(
      circle,
      circleHeight,
      textBubbleGroup
    );

    this.updateTextBubbleContent(grade, shape);
    shape.set('top', position.top);
  }

  /**
   * Renders sticky price elements with proper visibility control.
   */
  public renderStickyPrice(
    grade: Grade,
    shape: ExtendedGroup,
    isVisible: boolean,
    gradeShape: ExtendedGroup,
    subId: string,
    mapType: VenueMapType
  ): void {
    if (shape.subType === 'stickyPrice') {
      // Only render (make visible) when show price mode is on
      shape.set('opacity', isVisible && mapType === VenueMapType.GRADE_PRICE ? 1 : 0);

      if (isVisible && mapType === VenueMapType.GRADE_PRICE) {
        this.updateStickyPricePosition(grade, shape, gradeShape, subId, mapType);
      }
    }
  }
}
