class MapboxPathControl {
    constructor() { }
    onAdd(currentMap) {
        this.map = currentMap;
        this.pathControl = document.createElement("div");
        this.pathControl.innerHTML = "mapbox-gl-path";
        this.pathControl.className = "mapbox-gl-path-container";
        return this.pathControl;
    }
    onRemove() {
        var _a, _b;
        (_b = (_a = this.pathControl) === null || _a === void 0 ? void 0 : _a.parentNode) === null || _b === void 0 ? void 0 : _b.removeChild(this.pathControl);
        this.map = undefined;
    }
}

export default MapboxPathControl;
