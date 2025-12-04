/**
 * World Editor Utility Functions
 */

import { Color3, Vector3 } from '@babylonjs/core';

/**
 * Convert hex color string to Babylon.js Color3
 */
export const hexToColor3 = (hex: string): Color3 => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return new Color3(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    );
  }
  return new Color3(0.063, 0.725, 0.506); // Default #10b981
};

/**
 * Calculate sun altitude based on month and hour (Seoul latitude 37.5°)
 */
export const calculateSunAltitude = (month: number, hour: number): number => {
  // Solar declination - varies with month
  const dayOfYear = (month - 1) * 30 + 15; // Mid-month
  const declination = 23.45 * Math.sin((360 / 365) * (dayOfYear - 81) * (Math.PI / 180));

  // Seoul latitude
  const latitude = 37.5;

  // Hour angle - noon (12:00) is 0 degrees
  const hourAngle = (hour - 12) * 15; // 1 hour = 15 degrees

  // Calculate sun altitude
  const latRad = latitude * (Math.PI / 180);
  const decRad = declination * (Math.PI / 180);
  const haRad = hourAngle * (Math.PI / 180);

  const sinAltitude = Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);

  const altitude = Math.asin(sinAltitude) * (180 / Math.PI);

  // Clamp to 0-90 degrees (negative means sun is below horizon)
  return Math.max(0, Math.min(90, altitude));
};

/**
 * Calculate sun direction vector from altitude and azimuth
 */
export const calculateSunDirection = (altitudeDeg: number, azimuthDeg: number): Vector3 => {
  const altitudeRad = altitudeDeg * (Math.PI / 180);
  const azimuthRad = azimuthDeg * (Math.PI / 180);

  // Direction pointing FROM the sun TO the scene
  const x = -Math.sin(azimuthRad) * Math.cos(altitudeRad);
  const y = -Math.sin(altitudeRad);
  const z = -Math.cos(azimuthRad) * Math.cos(altitudeRad);

  return new Vector3(x, y, z);
};

/**
 * Calculate sun position for sky material
 */
export const calculateSunPosition = (altitudeDeg: number, azimuthDeg: number, distance: number = 1000): Vector3 => {
  const altitudeRad = altitudeDeg * (Math.PI / 180);
  const azimuthRad = azimuthDeg * (Math.PI / 180);

  return new Vector3(
    Math.cos(altitudeRad) * Math.sin(azimuthRad) * distance,
    Math.sin(altitudeRad) * distance,
    Math.cos(altitudeRad) * Math.cos(azimuthRad) * distance
  );
};

/**
 * Generate unique ID
 */
export const generateId = (prefix: string = 'obj'): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Clamp a number between min and max values
 */
export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Linear interpolation
 */
export const lerp = (start: number, end: number, t: number): number => {
  return start + (end - start) * t;
};

/**
 * Vector3 linear interpolation
 */
export const lerpVector3 = (start: Vector3, end: Vector3, t: number): Vector3 => {
  return new Vector3(
    lerp(start.x, end.x, t),
    lerp(start.y, end.y, t),
    lerp(start.z, end.z, t)
  );
};
