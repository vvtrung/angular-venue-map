import { Component } from '@angular/core';

import { VenueMapComponent, MapConfiguration } from "../../../ngx-venue-map/src/public-api"
import { grades } from './app.constant';

@Component({
  selector: 'app-root',
  imports: [VenueMapComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected title = 'demo-venue-map';
  grades = grades;

  // Single image configuration (default)
  singleImageConfig: Partial<MapConfiguration> & Pick<MapConfiguration, 'width' | 'height' | 'path'> = {
    width: 1600,
    height: 1245,
    path: '/images/map/venue-map.png',
  };

  // Multi-image configuration example
  multiImageConfig: Partial<MapConfiguration> & Pick<MapConfiguration, 'width' | 'height' | 'path'> = {
    width: 1600,
    height: 1245,
    path: [
      '/images/map/parts/0_0.png',
      '/images/map/parts/0_1.png',
      '/images/map/parts/1_0.png',
      '/images/map/parts/1_1.png'
    ],
  };

  // Current configuration (start with single image)
  mapConfig: Partial<MapConfiguration> & Pick<MapConfiguration, 'width' | 'height' | 'path'> = this.singleImageConfig;

  // Toggle between single and multi-image mode
  useMultiImage = false;

  toggleImageMode() {
    this.useMultiImage = !this.useMultiImage;
    this.mapConfig = this.useMultiImage ? this.multiImageConfig : this.singleImageConfig;
  }
}
