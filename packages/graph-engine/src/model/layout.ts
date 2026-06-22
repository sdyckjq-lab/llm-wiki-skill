import {
  isPinCoordinateSpace,
  LEGACY_PERCENT_PIN_COORDINATE_SPACE,
  WORLD_PIN_COORDINATE_SPACE,
  type GraphLayoutFile,
  type PinCoordinateSpace,
  type PinMap,
  type PinPosition,
  type WikiPath
} from "../types";

const MAX_WORLD_PIN_ABS_COORDINATE = 1000000;
const MAX_LEGACY_PERCENT_PIN_ABS_COORDINATE = 1000;

interface NormalizeGraphPinMapOptions {
  defaultCoordinateSpace?: PinCoordinateSpace;
  acceptKey?: (key: WikiPath) => boolean;
}

export function normalizeGraphLayoutFile(input: unknown): GraphLayoutFile {
  const raw = input && typeof input === "object" ? input as { pins?: unknown; updatedAt?: unknown; version?: unknown } : {};
  const defaultCoordinateSpace = raw.version === 1
    ? LEGACY_PERCENT_PIN_COORDINATE_SPACE
    : WORLD_PIN_COORDINATE_SPACE;
  return {
    version: 2,
    pins: normalizeGraphPinMapWithOptions(raw.pins, {
      defaultCoordinateSpace,
      acceptKey: isSafeGraphLayoutPinKey
    }),
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : ""
  };
}

export function normalizeGraphPinMap(rawPins: unknown): PinMap {
  return normalizeGraphPinMapWithOptions(rawPins);
}

function normalizeGraphPinMapWithOptions(rawPins: unknown, options: NormalizeGraphPinMapOptions = {}): PinMap {
  const normalized: PinMap = {};
  if (!rawPins || typeof rawPins !== "object") return normalized;
  const defaultCoordinateSpace = options.defaultCoordinateSpace || WORLD_PIN_COORDINATE_SPACE;
  for (const [key, value] of Object.entries(rawPins as Record<string, unknown>)) {
    if (options.acceptKey && !options.acceptKey(key)) continue;
    const position = normalizeGraphPinPosition(value, defaultCoordinateSpace);
    if (position) normalized[key] = position;
  }
  return normalized;
}

function isSafeGraphLayoutPinKey(key: WikiPath): boolean {
  return key.startsWith("wiki/")
    && !key.includes("..")
    && !key.startsWith("/")
    && !key.startsWith("\\")
    && !/^[A-Za-z]:[\\/]/.test(key);
}

function normalizeGraphPinPosition(value: unknown, defaultCoordinateSpace: PinCoordinateSpace): PinPosition | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; y?: unknown; coordinateSpace?: unknown };
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const coordinateSpace = isPinCoordinateSpace(point.coordinateSpace) ? point.coordinateSpace : defaultCoordinateSpace;
  if (coordinateSpace === WORLD_PIN_COORDINATE_SPACE && isImplausiblyDistantWorldPin(x, y)) return null;
  if (coordinateSpace === LEGACY_PERCENT_PIN_COORDINATE_SPACE && isImplausiblyDistantLegacyPercentPin(x, y)) return null;
  return {
    x,
    y,
    coordinateSpace
  };
}

function isImplausiblyDistantWorldPin(x: number, y: number): boolean {
  return Math.abs(x) > MAX_WORLD_PIN_ABS_COORDINATE || Math.abs(y) > MAX_WORLD_PIN_ABS_COORDINATE;
}

function isImplausiblyDistantLegacyPercentPin(x: number, y: number): boolean {
  return Math.abs(x) > MAX_LEGACY_PERCENT_PIN_ABS_COORDINATE || Math.abs(y) > MAX_LEGACY_PERCENT_PIN_ABS_COORDINATE;
}
