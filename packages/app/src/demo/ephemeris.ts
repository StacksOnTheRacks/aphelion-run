/**
 * Where the planets and the Moon are at a given moment, accurate to about a degree.
 *
 * Planet orbits use NASA JPL's "Approximate Positions of the Planets" (Standish), valid 1800–2050.
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
