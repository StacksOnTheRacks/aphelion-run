import {
	BODY_SCALE,
	EARTH_STATION_RADIUS,
	EARTH_WAREHOUSE_RADIUS,
	MOON_OUTER_ORBIT_SCALE,
	NO_MOON_HALO_SCALE,
	NO_MOON_OUTER_SCALE,
	SATURN_FLYBY_MARGIN,
	SATURN_RING_INNER_SCALE,
	SATURN_RING_OUTER_SCALE,
	INNER_ORBIT_INSET,
	SUN_OUTER_ORBIT,
	SYSTEM_SCALE,
	DOCK_SIZE,
	innerOrbitRadius,
	moonBaseRadius,
	LOCAL_REACH,
	playerHome,
	moonOuterOrbitRadius,
	nearBody,
	outerOrbitRadius,
	planetBases,
	radialReach,
	spacedMoonOrbits,
	warehouseRadius,
} from "./bases";
import { moonGeneratorSlots, planetGeneratorSlots } from "./generators";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

type MoonFixture = { name: string; orbit: number; diameter: number };
type PlanetFixture = {
	name: string;
	/** Distance from the Sun. Matches the environment demo, so neighboring zones can be checked. */
	orbit: number;
	diameter: number;
	moons: MoonFixture[];
	warehouseRadius?: number;
	stationRadius?: number;
	ringInnerScale?: number;
};

/** Design sizes from the environment demo, before the body and system scales. */
const DESIGN: PlanetFixture[] = [
	{ name: "mercury", orbit: 124, diameter: 8, moons: [] },
	{ name: "venus", orbit: 192, diameter: 12, moons: [] },
	{
		name: "earth",
		orbit: 272,
		diameter: 14,
		warehouseRadius: 16,
		stationRadius: 11,
		moons: [{ name: "moon", orbit: 52, diameter: 3.8 }],
	},
	{
		name: "mars",
		orbit: 360,
		diameter: 10,
		moons: [
			{ name: "phobos", orbit: 15, diameter: 0.7 },
			{ name: "deimos", orbit: 20, diameter: 0.5 },
		],
	},
	{
		name: "jupiter",
		orbit: 520,
		diameter: 34,
		moons: [
			{ name: "io", orbit: 48, diameter: 2.4 },
			{ name: "europa", orbit: 56, diameter: 2.1 },
			{ name: "ganymede", orbit: 68, diameter: 3.5 },
			{ name: "callisto", orbit: 80, diameter: 3.2 },
		],
	},
	{
		name: "saturn",
		orbit: 700,
		diameter: 28,
		ringInnerScale: SATURN_RING_INNER_SCALE,
		moons: [
			{ name: "mimas", orbit: 68, diameter: 0.6 },
			{ name: "enceladus", orbit: 73, diameter: 0.7 },
			{ name: "tethys", orbit: 78, diameter: 1.1 },
			{ name: "dione", orbit: 84, diameter: 1.2 },
			{ name: "rhea", orbit: 90, diameter: 1.5 },
			{ name: "titan", orbit: 102, diameter: 3.4 },
			{ name: "iapetus", orbit: 114, diameter: 1.4 },
		],
	},
	{
		name: "uranus",
		orbit: 880,
		diameter: 18,
		moons: [
			{ name: "miranda", orbit: 24, diameter: 0.6 },
			{ name: "ariel", orbit: 28, diameter: 1 },
			{ name: "umbriel", orbit: 33, diameter: 1 },
			{ name: "titania", orbit: 40, diameter: 1.3 },
			{ name: "oberon", orbit: 46, diameter: 1.3 },
		],
	},
	{
		name: "neptune",
		orbit: 1060,
		diameter: 18,
		moons: [
			{ name: "proteus", orbit: 23, diameter: 0.6 },
			{ name: "triton", orbit: 30, diameter: 2.2 },
			{ name: "nereid", orbit: 44, diameter: 0.5 },
		],
	},
];

/** The same growth the scene applies: body scale locally, system scale from the Sun, then moon gaps. */
function scaleFixture(planet: PlanetFixture): PlanetFixture {
	const moons = planet.moons.map((moon) => ({
		...moon,
		diameter: moon.diameter * BODY_SCALE,
		orbit: moon.orbit * BODY_SCALE,
	}));
	const orbits = spacedMoonOrbits(moons);
	return {
		...planet,
		orbit: planet.orbit * SYSTEM_SCALE,
		diameter: planet.diameter * BODY_SCALE,
		warehouseRadius: planet.warehouseRadius == null ? undefined : planet.warehouseRadius * BODY_SCALE,
		stationRadius: planet.stationRadius == null ? undefined : planet.stationRadius * BODY_SCALE,
		moons: moons.map((moon, index) => ({ ...moon, orbit: orbits[index] })),
	};
}

const PLANETS: PlanetFixture[] = DESIGN.map(scaleFixture);

function span(radius: number, width: number): { inner: number; outer: number } {
	const reach = width / 2;
	return { inner: radius - reach, outer: radius + reach };
}

for (const planet of PLANETS) {
	const placed = planetBases({ ...planet, homes: false });
	const surface = planet.diameter / 2;
	const occupiedOuter = planet.warehouseRadius ?? surface;

	expect(placed.warehouses.length === 0, `${planet.name} has no home bases`);

	if (planet.moons.length > 0 && planet.ringInnerScale == null && planet.warehouseRadius == null) {
		const innermost = planet.moons.reduce((near, moon) => (moon.orbit < near.orbit ? moon : near));
		const moonBody = innermost.orbit - innermost.diameter / 2;
		expect(warehouseRadius(planet) + radialReach(DOCK_SIZE) < moonBody, `${planet.name} halo clears ${innermost.name}`);
	}

	if (planet.ringInnerScale != null) {
		const ringInner = surface * planet.ringInnerScale;
		expect(warehouseRadius(planet) < ringInner, `${planet.name} halo sits inside the rings`);
		expect(
			warehouseRadius(planet) === (surface + ringInner) / 2,
			`${planet.name} halo is the midpoint of the inner gap`
		);
	}

	if (planet.moons.length === 0) {
		expect(
			warehouseRadius(planet) === surface * NO_MOON_HALO_SCALE,
			`${planet.name} halo is 1.8 times its radius`
		);
	}

	for (const moon of planet.moons) {
		if (moon.name !== "moon") {
			continue;
		}
		const home = playerHome(moon.diameter);
		expect(home.faction === "corporate", `${moon.name} keeps a corporate base`);
		expect(DOCK_SIZE.width < moon.diameter && DOCK_SIZE.depth < moon.diameter, `${moon.name} home is smaller than the moon`);
		expect(DOCK_SIZE.width === DOCK_SIZE.depth, `${moon.name} home is a square pad`);
		expect(home.radius === moonBaseRadius(moon.diameter), `${moon.name} radius matches the helper`);
		expect(home.size.width === DOCK_SIZE.width && home.size.depth === DOCK_SIZE.depth, `${moon.name} home uses the dock pad`);
		const moonSpan = span(home.radius, DOCK_SIZE.width);
		expect(moonSpan.inner > moon.diameter / 2, `${moon.name} home clears the surface`);
		const closestToPlanet = moon.orbit - moonSpan.outer;
		expect(closestToPlanet > occupiedOuter, `${moon.name} home clears ${planet.name}'s approach`);
		expect(closestToPlanet > surface, `${moon.name} home clears ${planet.name}`);
	}

	if (planet.stationRadius == null) {
		expect(placed.stations.length === 0, `${planet.name} has no energy stations`);
	}
}

const earthInput = PLANETS.find((planet) => planet.name === "earth");
if (!earthInput) {
	failures.push("Earth is missing from the fixture");
} else {
	const earth = planetBases({ ...earthInput, homes: false });
	expect(earth.warehouses.length === 0, "Earth has no warehouses");
	expect(earth.stations.length === 2, "Earth has two energy stations");
	expect(earth.stations[0].faction !== earth.stations[1].faction, "Earth stations are one per faction");
	expect(earth.stations[0].radius === EARTH_STATION_RADIUS, "Earth stations use the inner ring");
	const station = span(earth.stations[0].radius, earth.stations[0].size.width);
	const moon = earthInput.moons[0];
	expect(station.inner > earthInput.diameter / 2, "Earth stations clear the surface");
	expect(moon != null && station.outer < moon.orbit - moon.diameter / 2, "Earth stations clear the Moon");
}

// Every outer orbit clears that body's own bases and rings, and no two zones meet.
{
	const zones: { name: string; orbit: number; zone: number }[] = [
		{ name: "sun", orbit: 0, zone: SUN_OUTER_ORBIT },
	];
	for (const planet of PLANETS) {
		const zone = outerOrbitRadius(planet);
		const surface = planet.diameter / 2;
		expect(zone > surface, `${planet.name} outer orbit clears the surface`);
		const placed = planetBases({ ...planet, homes: false });
		for (const slot of [...placed.warehouses, ...placed.stations]) {
			expect(
				zone > slot.radius + radialReach(slot.size),
				`${planet.name} outer orbit clears its ${slot.faction} base`
			);
		}
		if (planet.moons.length === 0) {
			expect(zone === surface * NO_MOON_OUTER_SCALE, `${planet.name} outer orbit is 2.5 radii`);
		}
		if (planet.ringInnerScale != null) {
			expect(
				zone >= surface * SATURN_RING_OUTER_SCALE + SATURN_FLYBY_MARGIN,
				`${planet.name} outer orbit stays outside the rings`
			);
		}
		const moons = planet.moons.map((moon) => ({
			...moon,
			zone: moonOuterOrbitRadius(moon.diameter),
		}));
		for (const moon of moons) {
			expect(
				moon.zone === (moon.diameter / 2) * MOON_OUTER_ORBIT_SCALE,
				`${moon.name} outer orbit is 3 moon radii`
			);
			if (moon.name === "moon") {
				const home = playerHome(moon.diameter);
				expect(
					moon.zone > home.radius + radialReach(home.size),
					`${moon.name} outer orbit clears its home`
				);
			}
			expect(zone + moon.zone < moon.orbit, `${planet.name} outer orbit clears ${moon.name}'s zone`);
		}
		for (let i = 0; i < moons.length; i++) {
			for (let j = i + 1; j < moons.length; j++) {
				const gap = Math.abs(moons[i].orbit - moons[j].orbit);
				expect(gap > moons[i].zone + moons[j].zone, `${moons[i].name} and ${moons[j].name} zones stay apart`);
			}
		}
		for (let i = 1; i < moons.length; i++) {
			const gap = moons[i].orbit - moons[i - 1].orbit;
			const shells = moons[i - 1].zone + moons[i].zone;
			expect(
				gap + 1e-6 >= 2 * shells,
				`${moons[i - 1].name} and ${moons[i].name} leave a gap as wide as both shells`
			);
		}
		zones.push({ name: planet.name, orbit: planet.orbit, zone });
	}
	const bySun = [...zones].sort((a, b) => a.orbit - b.orbit);
	for (let i = 0; i < bySun.length - 1; i++) {
		const gap = bySun[i + 1].orbit - bySun[i].orbit;
		expect(
			gap > bySun[i].zone + bySun[i + 1].zone,
			`${bySun[i].name} and ${bySun[i + 1].name} zones stay apart at their closest`
		);
	}
	const byPlanet = [...PLANETS].sort((a, b) => a.orbit - b.orbit);
	const reach = (planet: PlanetFixture): number => {
		let far = outerOrbitRadius(planet);
		for (const moon of planet.moons) {
			far = Math.max(far, moon.orbit + moonOuterOrbitRadius(moon.diameter));
		}
		return far;
	};
	for (let i = 0; i < byPlanet.length - 1; i++) {
		const inner = byPlanet[i];
		const outer = byPlanet[i + 1];
		const gap = outer.orbit - reach(outer) - (inner.orbit + reach(inner));
		expect(gap > 0, `${inner.name} and ${outer.name} moon systems stay apart at conjunction`);
	}
}

const body = { x: 0, y: 0, z: 0 };
const outer = 31;
expect(nearBody(body, body, outer), "a ship on the body is near it");
expect(nearBody({ x: outer * LOCAL_REACH, y: 0, z: 0 }, body, outer), "a ship at the reach still sees the honeycomb");
expect(!nearBody({ x: outer * LOCAL_REACH + 0.01, y: 0, z: 0 }, body, outer), "a ship past the reach is in open space");
expect(!nearBody({ x: 0, y: outer * LOCAL_REACH + 1, z: 0 }, body, outer), "height counts, so a ship far above the shell is not near it");
expect(!nearBody(body, body, 0), "a body with no outer orbit has no honeycomb");

expect(INNER_ORBIT_INSET > 0 && INNER_ORBIT_INSET < 0.1, "the inner orbit inset is a sliver inside the shell");
{
	const sunInner = innerOrbitRadius(SUN_OUTER_ORBIT);
	expect(sunInner < SUN_OUTER_ORBIT, "the Sun's inner orbit sits inside the honeycomb");
	expect(sunInner > SUN_OUTER_ORBIT * 0.9, "the Sun's inner orbit stays just inside the honeycomb");
	for (const planet of PLANETS) {
		const shell = outerOrbitRadius(planet);
		const inner = innerOrbitRadius(shell);
		expect(inner < shell, `${planet.name} inner orbit sits inside the honeycomb`);
		for (const slot of planetGeneratorSlots(planet.name, { ...planet, homes: false })) {
			expect(
				inner > slot.radius + radialReach(slot.size),
				`${planet.name} inner orbit sits outside its ${slot.resource} mine`
			);
		}
		for (const moon of planet.moons) {
			const moonShell = moonOuterOrbitRadius(moon.diameter);
			const moonInner = innerOrbitRadius(moonShell);
			expect(moonInner < moonShell, `${moon.name} inner orbit sits inside the honeycomb`);
			for (const slot of moonGeneratorSlots(planet.name, moon.diameter)) {
				expect(
					moonInner > slot.radius + radialReach(slot.size),
					`${moon.name} inner orbit sits outside its ${slot.resource} mine`
				);
			}
		}
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("base halos clear bodies");
