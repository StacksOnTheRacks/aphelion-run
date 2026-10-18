import {
	EARTH_STATION_RADIUS,
	EARTH_WAREHOUSE_RADIUS,
	MOON_BASES_PER_FACTION,
	MOON_OUTER_ORBIT_SCALE,
	NO_MOON_HALO_SCALE,
	NO_MOON_OUTER_SCALE,
	PLANET_BASES_PER_FACTION,
	SATURN_FLYBY_MARGIN,
	SATURN_RING_INNER_SCALE,
	SATURN_RING_OUTER_SCALE,
	SUN_OUTER_ORBIT,
	moonBaseRadius,
	moonBaseSize,
	moonBases,
	LOCAL_REACH,
	moonOuterOrbitRadius,
	nearBody,
	outerOrbitRadius,
	planetBases,
	radialReach,
	warehouseRadius,
} from "./bases";

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
	homes?: boolean;
};

/** Diameters and moon orbits from the environment demo. */
const PLANETS: PlanetFixture[] = [
	{ name: "mercury", orbit: 124, diameter: 8, moons: [] },
	{ name: "venus", orbit: 192, diameter: 12, moons: [] },
	{
		name: "earth",
		orbit: 272,
		diameter: 14,
		homes: false,
		warehouseRadius: EARTH_WAREHOUSE_RADIUS,
		stationRadius: EARTH_STATION_RADIUS,
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

function span(radius: number, width: number): { inner: number; outer: number } {
	const reach = width / 2;
	return { inner: radius - reach, outer: radius + reach };
}

for (const planet of PLANETS) {
	const placed = planetBases(planet);
	const surface = planet.diameter / 2;
	const homes = planet.homes !== false;
	const occupiedOuter =
		placed.warehouses.length > 0
			? span(placed.warehouses[0].radius, placed.warehouses[0].size.width).outer
			: (planet.warehouseRadius ?? surface);

	if (homes) {
		expect(placed.warehouses.length === PLANET_BASES_PER_FACTION * 2, `${planet.name} has 8 warehouses`);
		expect(
			placed.warehouses.filter((slot) => slot.faction === "corporate").length === PLANET_BASES_PER_FACTION,
			`${planet.name} splits warehouses across both factions`
		);

		const warehouses = span(placed.warehouses[0].radius, placed.warehouses[0].size.width);
		expect(warehouses.inner > surface, `${planet.name} warehouses clear the surface`);

		if (planet.moons.length > 0 && planet.ringInnerScale == null && planet.warehouseRadius == null) {
			const innermost = planet.moons.reduce((near, moon) => (moon.orbit < near.orbit ? moon : near));
			const moonBody = innermost.orbit - innermost.diameter / 2;
			expect(warehouses.outer < moonBody, `${planet.name} warehouses clear ${innermost.name}`);
		}

		if (planet.ringInnerScale != null) {
			const ringInner = surface * planet.ringInnerScale;
			const ringOuter = surface * SATURN_RING_OUTER_SCALE;
			expect(warehouses.outer < ringInner, `${planet.name} warehouses sit inside the rings`);
			expect(
				warehouseRadius(planet) === (surface + ringInner) / 2,
				`${planet.name} halo is the midpoint of the inner gap`
			);
			for (const moon of planet.moons) {
				const bases = moonBases(moon.diameter);
				const outerReach = bases[0].radius + radialReach(bases[0].size);
				expect(moon.orbit - outerReach > ringOuter, `${moon.name} bases stay outside Saturn's rings`);
			}
		}

		if (planet.moons.length === 0) {
			expect(
				warehouseRadius(planet) === surface * NO_MOON_HALO_SCALE,
				`${planet.name} halo is 1.8 times its radius`
			);
		}
	} else {
		expect(placed.warehouses.length === 0, `${planet.name} has no warehouses`);
	}

	for (const moon of planet.moons) {
		const bases = moonBases(moon.diameter);
		const size = moonBaseSize(moon.diameter);
		expect(bases.length === MOON_BASES_PER_FACTION * 2, `${moon.name} has 2 bases`);
		expect(bases[0].faction !== bases[1].faction, `${moon.name} bases are one of each faction`);
		expect(size.width < moon.diameter && size.depth < moon.diameter, `${moon.name} bases are smaller than the moon`);
		expect(bases[0].radius === moonBaseRadius(moon.diameter), `${moon.name} radius matches the helper`);
		const moonSpan = span(bases[0].radius, size.width);
		expect(moonSpan.inner > moon.diameter / 2, `${moon.name} bases clear the surface`);
		const closestToPlanet = moon.orbit - moonSpan.outer;
		expect(
			closestToPlanet > occupiedOuter,
			homes
				? `${moon.name} bases clear ${planet.name}'s warehouses`
				: `${moon.name} bases clear ${planet.name}'s approach`
		);
		expect(closestToPlanet > surface, `${moon.name} bases clear ${planet.name}`);
	}

	if (planet.stationRadius == null) {
		expect(placed.stations.length === 0, `${planet.name} has no energy stations`);
	}
}

const earthInput = PLANETS.find((planet) => planet.name === "earth");
if (!earthInput) {
	failures.push("Earth is missing from the fixture");
} else {
	const earth = planetBases(earthInput);
	expect(earth.warehouses.length === 0, "Earth has no warehouses");
	expect(earth.stations.length === 2, "Earth has two energy stations");
	expect(earth.stations[0].faction !== earth.stations[1].faction, "Earth stations are one per faction");
	expect(earth.stations[0].radius === EARTH_STATION_RADIUS, "Earth stations use the inner ring");
	const station = span(earth.stations[0].radius, earth.stations[0].size.width);
	expect(station.inner > 7, "Earth stations clear the surface");
	expect(station.outer < 52 - 3.8 / 2, "Earth stations clear the Moon");
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
		const placed = planetBases(planet);
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
			const bases = moonBases(moon.diameter);
			expect(
				moon.zone === (moon.diameter / 2) * MOON_OUTER_ORBIT_SCALE,
				`${moon.name} outer orbit is 3 moon radii`
			);
			expect(
				moon.zone > bases[0].radius + radialReach(bases[0].size),
				`${moon.name} outer orbit clears its bases`
			);
			expect(zone + moon.zone < moon.orbit, `${planet.name} outer orbit clears ${moon.name}'s zone`);
		}
		for (let i = 0; i < moons.length; i++) {
			for (let j = i + 1; j < moons.length; j++) {
				const gap = Math.abs(moons[i].orbit - moons[j].orbit);
				expect(gap > moons[i].zone + moons[j].zone, `${moons[i].name} and ${moons[j].name} zones stay apart`);
			}
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
}

const body = { x: 0, y: 0, z: 0 };
const outer = 31;
expect(nearBody(body, body, outer), "a ship on the body is near it");
expect(nearBody({ x: outer * LOCAL_REACH, y: 0, z: 0 }, body, outer), "a ship at the reach still sees the honeycomb");
expect(!nearBody({ x: outer * LOCAL_REACH + 0.01, y: 0, z: 0 }, body, outer), "a ship past the reach is in open space");
expect(!nearBody({ x: 0, y: outer * LOCAL_REACH + 1, z: 0 }, body, outer), "height counts, so a ship far above the shell is not near it");
expect(!nearBody(body, body, 0), "a body with no outer orbit has no honeycomb");

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("base halos clear bodies");
