import { Map, IControl } from "mapbox-gl";
import "./mapbox-gl-path.css";

export default class MapboxPathControl implements IControl {
  private map: Map | undefined;
  private pathControl: HTMLElement | undefined;

  constructor() {}

  public onAdd(currentMap: Map): HTMLElement {
    this.map = currentMap;
    this.pathControl = document.createElement("div");
    this.pathControl.innerHTML = "mapbox-gl-path";
    this.pathControl.className = "mapbox-gl-path-container";
    return this.pathControl;
  }

  public onRemove(): void {
    this.pathControl?.parentNode?.removeChild(this.pathControl);
    this.map = undefined;
  }
}
