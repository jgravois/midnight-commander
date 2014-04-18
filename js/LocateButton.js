define([
    "dojo/Evented",
    "dojo/_base/declare",
    "dojo/_base/lang",
    "dojo/has",
    "esri/kernel",
    "esri/config",
    "dijit/_WidgetBase",
    "dijit/a11yclick",
    "dijit/_TemplatedMixin",
    "dojo/on",
    "dojo/Deferred",
    // load template
    "dojo/text!application/dijit/templates/LocateButton.html",
    "dojo/i18n!application/nls/jsapi",
    "dojo/dom-class",
    "dojo/dom-style",
    "dojo/dom-attr",
    "esri/geometry/Point",
    "esri/SpatialReference",
    "esri/graphic",
    "esri/symbols/PictureMarkerSymbol",
    //erwin add
    "dojo/_base/Color",
    "dojo/_base/connect",
    "esri/layers/GraphicsLayer",
    //dupllicate "esri/graphic",
    "esri/symbols/SimpleFillSymbol",
    "esri/geometry/Polygon",
    "esri/geometry/webMercatorUtils",
],
function (
    Evented,
    declare,
    lang,
    has, esriNS, esriConfig,
    _WidgetBase, a11yclick, _TemplatedMixin,
    on,
    Deferred,
    dijitTemplate, i18n,
    domClass, domStyle, domAttr,
    Point, SpatialReference,
    Graphic, PictureMarkerSymbol,
    Color, connect,
    GraphicsLayer, SimpleFillSymbol,
    Polygon, webMercatorUtils
) {
    var Widget = declare([_WidgetBase, _TemplatedMixin, Evented], {
        declaredClass: "esri.dijit.LocateButton",
        templateString: dijitTemplate,
        options: {
            theme: "LocateButton",
           id : null,
                map: null,
                dateTime : null,
                refreshIntervalMs : 5000,
                graphicsLayer: null,
                symbol : new SimpleFillSymbol("solid", null, new Color([0, 0, 0, 0.35])),
                _interval : null,
                _connects : [],
                _wkid : 4326
        },
        // lifecycle: 1
        constructor: function(options, srcRefNode) {
            // mix in settings and defaults
            var defaults = lang.mixin({}, this.options, options);
            // widget node
            this.domNode = srcRefNode;
            this._i18n = i18n;
            
            // properties
                this.set("map", defaults.map);
                this.set("theme", defaults.theme);
                this.set("dateTime", defaults.dateTime);
                this.set("refreshIntervalMs", defaults.refreshIntervalMs);
                this.set("symbol", defaults.symbol); 
                this.set("visible", defaults.visible); 
                this.set("graphicsLayer", defaults.graphicsLayer); 
                this._css = {
                container: "locateContainer",
                locate: "zoomLocateButton",
                loading: "loading",
                tracking: "tracking"
                };
        },
        // bind listener for button to action
        postCreate: function() {
            this.inherited(arguments);
            this.own(on(this._locateNode, a11yclick, lang.hitch(this, this.locate)));
        },
        // start widget. called by user
        startup: function() {
            // map not defined
            if (!this.get("map")) {
                this.destroy();
                console.log('LocateButton::map required');
            }
            // when map is loaded
            if (this.get("map").loaded) {
                this._init();
            } else {
                on.once(this.get("map"), "load", lang.hitch(this, function() {
                    this._init();
                }));
            }
        },
        // connections/subscriptions will be cleaned up during the destroy() lifecycle phase
        // destroy: function() {
        //     // remove graphics layer event
        //     if (this._graphicsEvent) {
        //         this._graphicsEvent.remove();
        //     }
        //     // remove watch if there
        //     this._removeWatchPosition();
        //     // do other stuff
        //     this.inherited(arguments);
        // },
        /* ---------------- */
        /* Public Events */
        /* ---------------- */
        // locate
        // load
        /* ---------------- */
        /* Public Functions */
        /* ---------------- */
        clear: function() {
            var g = this.get("highlightGraphic"), gl = this.get("graphicsLayer");
            if(g){
                if(gl){
                    gl.remove(g);
                }
                else{
                    this.get("map").graphics.remove(g);   
                }
                this.set("highlightGraphic", null);
            }
        },
        locate: function() {
            // toggle tracking
            this.get("graphicsLayer").clear();
            this.inherited(arguments);
                this.clear();
                var geoms = this._getGeometries();
                for (var i = 0; i < geoms.length; i++) {
                    this.get("graphicsLayer").add(new Graphic(geoms[i], this.symbol));
                }
            return this._locate();
        },
        
        /* ---------------- */
        /* Private Functions */
        /* ---------------- */
        onVisibilityChange : function (visibility) {
                this.inherited(arguments);
                if (visibility) {
                    this._attachInterval();
                } else {
                    this._detachInterval();
                }
            },
            // private functions 
            _attachInterval : function () {
                if (this._interval != null) {
                    this._detachInterval();
                }
                this._interval = setInterval(lang.hitch(this, this.refresh), this.refreshIntervalMs);
            },
            _detachInterval : function () {
                if (this._interval != null) {
                    clearInterval(this._interval);
                    this._interval = null;
                }
            },
            _getDaysInMonth : function (month, year) {
                var daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                if (month >= daysInMonth.length) {
                    return 0;
                }
                if (month == 1 && new Date(year, 2 - 1, 29).getDate() == 29) {
                    return 29;
                } else {
                    return daysInMonth[month];
                }
            },
            _getGeometries : function () {
                var geoms = [];
                var dt = this.dateTime || new Date();
                var solarDeclination = this._getSolarDeclination(dt);
                var isWebMercator = (this._wkid === 102100 || this._wkid === 3857 || this._wkid === 102113);
                var yMax = (isWebMercator ? 85 : 90);
                var latitude = yMax * (solarDeclination > 0 ? -1 : 1);
                for (var lon = -180; lon < 180; lon++) {
                    var path = [];
                    path.push([lon + 1, latitude]);
                    path.push([lon, latitude]);
                    path.push([lon, this._getLatitude(lon, solarDeclination, dt, -yMax, yMax)]);
                    path.push([lon + 1, this._getLatitude(lon + 1, solarDeclination, dt, -yMax, yMax)]);
                    path.push([lon + 1, latitude]);
                    geoms.push(new Polygon({
                            rings : [path],
                            spatialReference : {
                                wkid : 4326
                            }
                        }));
                }
                if (isWebMercator) {
                    for (var i = 0; i < geoms.length; i++) {
                        geoms[i] = webMercatorUtils.geographicToWebMercator(geoms[i]);
                    }
                }
                return geoms;
            },
            _getLatitude : function (longitude, solarDeclination, dt, yMin, yMax) {
                var K = Math.PI / 180;
                var lt = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
                var tau = 15 * (lt - 12);
                longitude += tau;
                var tanLat = -Math.cos(longitude * K) / Math.tan(solarDeclination * K);
                var arctanLat = Math.atan(tanLat) / K;
                return Math.max(Math.min(arctanLat, yMax), yMin);
            },
            _getOrdinalDay : function (dt) {
                var ordinalDay = 0;
                for (var i = 0; i < dt.getMonth(); i++) {
                    ordinalDay += this._getDaysInMonth(i);
                }
                ordinalDay += dt.getDate();
                return ordinalDay;
            },
            _getSolarDeclination : function (dt) { // http://en.wikipedia.org/wiki/Declination
                dt = dt || new Date();
                var ordinalDay = this._getOrdinalDay(dt);
                return -57.295779 * Math.asin(0.397788 * Math.cos(0.017203 * (ordinalDay + 10) + 0.052465 * Math.sin(0.017203 * (ordinalDay - 2))));
            },
            _getSolarDeclinationApprox : function (dt) { // not used // http://en.wikipedia.org/wiki/Declination
                dt = dt || new Date();
                return -Math.abs(23.44 * Math.cos((this._getOrdinalDay(dt) - 1 + 10) * ((2 * Math.PI) / 365.25)));
            },
            _onTimeExtentChange : function (timeExtent) {
                this.dateTime = timeExtent.endTime || timeExtent.startTime;
                this.refresh();
            }
    });
    if (has("extend-esri")) {
        lang.setObject("dijit.LocateButton", Widget, esriNS);
    }
    return Widget;
});
