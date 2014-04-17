/* 
 * SolarTerminatorLayer.js
 *
 * CODE PROVIDED AS-IS AND WITHOUT WARRANTY.
 */

dojo.provide("SolarTerminatorLayer");

dojo.require("esri.layers.graphics");

dojo.declare("SolarTerminatorLayer", [ esri.layers.GraphicsLayer ], {
  /***** public properties *****/
  id: null,
  dateTime: null,
  refreshIntervalMs: 5000,
  symbol: new esri.symbol.SimpleFillSymbol("solid", null, new dojo.Color([ 0, 0, 0, 0.35 ])),
  /***** private properties *****/
  _interval: null,
  _connects: [],
  _wkid: 4326,
  constructor: function(args) {
    this.inherited(arguments);
    dojo.safeMixin(this, args);
  },
  /***** setup override *****/
  enableMouseEvents: function() {
    this.inherited(arguments);
    this._wkid = this._map.spatialReference.wkid;
    if (this.visible) {
      this._attachInterval();
    }
    this._connects.push(dojo.connect(this._map, "onTimeExtentChange", this, this._onTimeExtentChange));
    this.refresh();
  },
  /***** teardown override *****/
  _unsetMap: function() {
    this.inherited(arguments);
    this._detachInterval();
    while (this._connects.length > 0) {
      dojo.disconnect(this._connects.pop());
    }
  },
  /***** public functions *****/
  refresh: function() {
    this.inherited(arguments);
    this.clear();
    var geoms = this._getGeometries();
    for (var i = 0; i < geoms.length; i++) {
      this.add(new esri.Graphic(geoms[i], this.symbol));
    }
  },
  onVisibilityChange: function(visibility) {
    this.inherited(arguments);
    if (visibility) {
      this._attachInterval();
    } else {
      this._detachInterval();
    }
  },
  /***** private functions *****/
  _attachInterval: function() {
    if (this._interval != null) {
      this._detachInterval();
    }
    this._interval = setInterval(dojo.hitch(this, this.refresh), this.refreshIntervalMs);
  },
  _detachInterval: function() {
    if (this._interval != null) {
      clearInterval(this._interval);
      this._interval = null;
    }
  },
  _getDaysInMonth: function(month, year) {
    var daysInMonth = [ 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 ];
    if (month >= daysInMonth.length) {
      return 0;
    }
    if (month == 1 && new Date(year, 2 - 1, 29).getDate() == 29) {
      return 29;
    } else {
      return daysInMonth[month];
    }
  },
  _getGeometries: function() {
    var geoms = [];
    var dt = this.dateTime || new Date();
    var solarDeclination = this._getSolarDeclination(dt);
    var isWebMercator = (this._wkid === 102100 || this._wkid === 3857 || this._wkid === 102113);
    var yMax = (isWebMercator ? 85 : 90);
    var latitude = yMax * (solarDeclination > 0 ? -1 : 1);
    for (var lon = -180; lon < 180; lon++) {
      var path = [];
      path.push([ lon + 1, latitude ]);
      path.push([ lon,     latitude ]);
      path.push([ lon,     this._getLatitude(lon,     solarDeclination, dt, -yMax, yMax) ]);
      path.push([ lon + 1, this._getLatitude(lon + 1, solarDeclination, dt, -yMax, yMax) ]);
      path.push([ lon + 1, latitude ]);
      geoms.push(new esri.geometry.Polygon({ rings: [ path ], spatialReference: { wkid: 4326 } }));
    }
    if (isWebMercator) {
      for (var i = 0; i < geoms.length; i++) {
        geoms[i] = esri.geometry.geographicToWebMercator(geoms[i]);
      }
    }
    return geoms;
  },
  _getLatitude: function(longitude, solarDeclination, dt, yMin, yMax) {
    var K = Math.PI / 180;
    var lt = dt.getUTCHours() + dt.getUTCMinutes() / 60 + dt.getUTCSeconds() / 3600;
	var tau = 15 * (lt - 12);
	longitude += tau;
    var tanLat = -Math.cos(longitude * K) / Math.tan(solarDeclination * K);
    var arctanLat = Math.atan(tanLat) / K;
    return Math.max(Math.min(arctanLat, yMax), yMin);
  },
  _getOrdinalDay: function(dt) {
    var ordinalDay = 0;
    for (var i = 0; i < dt.getMonth(); i++) {
      ordinalDay += this._getDaysInMonth(i);
    }
    ordinalDay += dt.getDate();
    return ordinalDay;
  },
  _getSolarDeclination: function(dt) { // http://en.wikipedia.org/wiki/Declination
    dt = dt || new Date();
    var ordinalDay = this._getOrdinalDay(dt);
    return -57.295779 * Math.asin(0.397788 * Math.cos(0.017203 * (ordinalDay + 10) + 0.052465 * Math.sin(0.017203 * (ordinalDay - 2))));
  },
  _getSolarDeclinationApprox: function(dt) { // not used // http://en.wikipedia.org/wiki/Declination
    dt = dt || new Date();
    return -Math.abs(23.44 * Math.cos((this._getOrdinalDay(dt) - 1 + 10) * ((2 * Math.PI) / 365.25)));
  },
  _onTimeExtentChange: function(timeExtent) {
    this.dateTime = timeExtent.endTime || timeExtent.startTime;
    this.refresh();
  }
});
