// js/state.js - Shared application state

export let map = null;
export let markers = [];
export let markerCount = 0;
export let layerGroups = {};
export let connectionLines = [];
export let layerStates = { earthquakes: true };
export let previousPressure = null;
export let currentMarkerData = null;
export let lastScannedCoords = null;
export let deviceType = 'desktop';
export let activeMobileTab = 'map';
export let searchTimeout = null;
export const isMobile = window.matchMedia("(max-width: 768px)").matches;

export function setMap(m) { map = m; }
export function setMarkers(m) { markers = m; }
export function setMarkerCount(n) { markerCount = n; }
export function incrementMarkerCount() { markerCount++; return markerCount; }
export function decrementMarkerCount() { markerCount--; return markerCount; }
export function setCurrentMarkerData(d) { currentMarkerData = d; }
export function setLastScannedCoords(c) { lastScannedCoords = c; }
export function setDeviceType(t) { deviceType = t; }
export function setActiveMobileTab(t) { activeMobileTab = t; }
export function setSearchTimeout(t) { searchTimeout = t; }
export function setPreviousPressure(p) { previousPressure = p; }
export function setLayerGroups(g) { layerGroups = g; }
export function setConnectionLines(l) { connectionLines = l; }
