/**
 * Where the planets, Pluto, and the Moon are at a given moment, accurate to about a degree.
 *
 * Planet orbits use NASA JPL's "Approximate Positions of the Planets" (Standish), valid 1800–2050.
 * Pluto is not in that table. Its place uses a Kepler orbit for the J2000 elements: the distance
 * changes, and the orbit is inclined, which the eight planets do not need at this accuracy.
 * The Moon uses the largest terms of its orbit from Meeus, "Astronomical Algorithms".
 * Angles are ecliptic longitudes in radians: measured in the plane of Earth's orbit, counterclockwise
 * seen from the north, starting from the direction of the Sun at the March equinox.
 */

export type EphemerisPlanet = "mercury" | "venus" | "earth" | "mars" | "jupiter" | "saturn" | "uranus" | "neptune";

type Elements = {
	/** Eccentricity and its change per century. */
	e: [number, number];
	/** Mean longitude, degrees, and its change per century. */
	L: [number, number];
	/** Longitude of perihelion, degrees, and its change per century. */
	perihelion: [number, number];
};

const ELEMENTS: Record<EphemerisPlanet, Elements> = {
	mercury: { e: [0.20563593, 0.00001906], L: [252.2503235, 149472.67411175], perihelion: [77.45779628, 0.16047689] },
	venus: { e: [0.00677672, -0.00004107], L: [181.9790995, 58517.81538729], perihelion: [131.60246718, 0.00268329] },
	earth: { e: [0.01671123, -0.00004392], L: [100.46457166, 35999.37244981], perihelion: [102.93768193, 0.32327364] },
	mars: { e: [0.0933941, 0.00007882], L: [-4.55343205, 19140.30268499], perihelion: [-23.94362959, 0.44441088] },
	jupiter: { e: [0.04838624, -0.00013253], L: [34.39644051, 3034.74612775], perihelion: [14.72847983, 0.21252668] },
	saturn: { e: [0.05386179, -0.00050991], L: [49.95424423, 1222.49362201], perihelion: [92.59887831, -0.41897216] },
	uranus: { e: [0.04725744, -0.00004397], L: [313.23810451, 428.48202785], perihelion: [170.9542763, 0.40805281] },
	neptune: { e: [0.00859048, 0.00005105], L: [-55.12002969, 218.45945325], perihelion: [44.96476227, -0.32241464] },
};

const DEGREES = Math.PI / 180;
const UNIX_EPOCH_JULIAN_DAY = 2440587.5;
const J2000_JULIAN_DAY = 2451545.0;

/** Days since noon UTC on 1 January 2000, the reference moment for every formula here. */
export function daysSinceJ2000(unixMs: number): number {
	return unixMs / 86_400_000 + UNIX_EPOCH_JULIAN_DAY - J2000_JULIAN_DAY;
}

/** The planet's direction as seen from the Sun. */
export function planetLongitude(planet: EphemerisPlanet, days: number): number {
	const centuries = days / 36525;
	const { e: eccentricityTerms, L, perihelion } = ELEMENTS[planet];
	const e = eccentricityTerms[0] + eccentricityTerms[1] * centuries;
	const meanLongitude = (L[0] + L[1] * centuries) * DEGREES;
	const perihelionLongitude = (perihelion[0] + perihelion[1] * centuries) * DEGREES;
	const meanAnomaly = wrap(meanLongitude - perihelionLongitude);

	let eccentricAnomaly = meanAnomaly + e * Math.sin(meanAnomaly);
	for (let i = 0; i < 6; i++) {
		eccentricAnomaly -=
			(eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomaly) / (1 - e * Math.cos(eccentricAnomaly));
	}
	const trueAnomaly =
		2 *
		Math.atan2(
			Math.sqrt(1 + e) * Math.sin(eccentricAnomaly / 2),
			Math.sqrt(1 - e) * Math.cos(eccentricAnomaly / 2)
		);
	return wrap(perihelionLongitude + trueAnomaly);
}

/** The Moon's direction as seen from Earth. */
export function moonLongitude(days: number): number {
	const meanLongitude = 218.3164477 + 13.17639648 * days;
	const elongation = (297.8501921 + 12.19074912 * days) * DEGREES;
	const sunAnomaly = (357.5291092 + 0.98560028 * days) * DEGREES;
	const moonAnomaly = (134.9633964 + 13.06499295 * days) * DEGREES;
	const fromNode = (93.272095 + 13.22935024 * days) * DEGREES;
	const longitude =
		meanLongitude +
		6.289 * Math.sin(moonAnomaly) +
		1.274 * Math.sin(2 * elongation - moonAnomaly) +
		0.658 * Math.sin(2 * elongation) +
		0.214 * Math.sin(2 * moonAnomaly) -
		0.186 * Math.sin(sunAnomaly) -
		0.114 * Math.sin(2 * fromNode);
	return wrap(longitude * DEGREES);
}

/**
 * How far Earth has turned: the direction the Greenwich meridian points, measured along Earth's equator
 * from the March equinox direction (Greenwich mean sidereal time).
 */
export function greenwichAngle(days: number): number {
	return wrap((280.46061837 + 360.98564736629 * days) * DEGREES);
}

function wrap(angle: number): number {
	const turn = Math.PI * 2;
	return ((angle % turn) + turn) % turn;
}

/** Pluto's semi-major axis and eccentricity. Perihelion was 5 September 1989. */
const PLUTO_AXIS_AU = 39.482;
const PLUTO_ECCENTRICITY = 0.2488;
const PLUTO_INCLINATION = 17.16 * DEGREES;
const PLUTO_NODE = 110.299 * DEGREES;
const PLUTO_ARGUMENT = 113.834 * DEGREES;
const PLUTO_PERIOD_DAYS = 247.94 * 365.25;
/** Days from that perihelion to noon on 1 January 2000, so the anomaly is 0 on the perihelion date. */
const PLUTO_PERIHELION_BEFORE_J2000 = 3770.5;

export const PLUTO_PERIHELION_AU = PLUTO_AXIS_AU * (1 - PLUTO_ECCENTRICITY);
export const PLUTO_APHELION_AU = PLUTO_AXIS_AU * (1 + PLUTO_ECCENTRICITY);

/** A direction in scene axes (x equinox, y north, z longitude 90°) and a distance in AU. */
export type SkyPoint = { x: number; y: number; z: number; au: number };

function plutoDirection(trueAnomaly: number, au: number): SkyPoint {
	const fromNode = trueAnomaly + PLUTO_ARGUMENT;
	const cosNode = Math.cos(PLUTO_NODE);
	const sinNode = Math.sin(PLUTO_NODE);
	const cosFromNode = Math.cos(fromNode);
	const sinFromNode = Math.sin(fromNode);
	const cosTilt = Math.cos(PLUTO_INCLINATION);
	const sinTilt = Math.sin(PLUTO_INCLINATION);
	return {
		x: cosNode * cosFromNode - sinNode * sinFromNode * cosTilt,
		y: sinFromNode * sinTilt,
		z: sinNode * cosFromNode + cosNode * sinFromNode * cosTilt,
		au,
	};
}

function plutoFromTrueAnomaly(trueAnomaly: number): SkyPoint {
	const e = PLUTO_ECCENTRICITY;
	const au = (PLUTO_AXIS_AU * (1 - e * e)) / (1 + e * Math.cos(trueAnomaly));
	return plutoDirection(trueAnomaly, au);
}

/** Pluto's place at `days` since J2000. The direction is a unit vector. */
export function plutoPlace(days: number): SkyPoint {
	const meanAnomaly = wrap(
		(PLUTO_PERIHELION_BEFORE_J2000 / PLUTO_PERIOD_DAYS) * Math.PI * 2 + (Math.PI * 2 * days) / PLUTO_PERIOD_DAYS
	);
	const e = PLUTO_ECCENTRICITY;
	let eccentricAnomaly = meanAnomaly + e * Math.sin(meanAnomaly);
	for (let i = 0; i < 8; i++) {
		eccentricAnomaly -=
			(eccentricAnomaly - e * Math.sin(eccentricAnomaly) - meanAnomaly) / (1 - e * Math.cos(eccentricAnomaly));
	}
	const trueAnomaly =
		2 *
		Math.atan2(
			Math.sqrt(1 + e) * Math.sin(eccentricAnomaly / 2),
			Math.sqrt(1 - e) * Math.cos(eccentricAnomaly / 2)
		);
	return plutoDirection(trueAnomaly, PLUTO_AXIS_AU * (1 - e * Math.cos(eccentricAnomaly)));
}

/** One lap of Pluto's orbit, evenly in true anomaly, closed back on the first point. */
export function plutoTrack(steps: number): SkyPoint[] {
	const points: SkyPoint[] = [];
	for (let i = 0; i <= steps; i++) {
		points.push(plutoFromTrueAnomaly((i / steps) * Math.PI * 2));
	}
	return points;
}
