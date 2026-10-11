import {
	EARTH_STATION_RADIUS,
	EARTH_WAREHOUSE_RADIUS,
	MOON_BASES_PER_FACTION,
	NO_MOON_HALO_SCALE,
	PLANET_BASES_PER_FACTION,
	SATURN_RING_INNER_SCALE,
	SATURN_RING_OUTER_SCALE,
	moonBaseRadius,
	moonBaseSize,
	moonBases,
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
	diameter: number;
	moons: MoonFixture[];
	warehouseRadius?: number;
	stationRadius?: number;
	ringInnerScale?: number;
};

/** Diameters and moon orbits from the environment demo. */
const PLANETS: PlanetFixture[] = [
	{ name: "mercury", diameter: 8, moons: [] },
	{ name: "venus", diameter: 12, moons: [] },
	{
		name: "earth",
		diameter: 14,
		warehouseRadius: EARTH_WAREHOUSE_RADIUS,
		stationRadius: EARTH_STATION_RADIUS,
		moons: [{ name: "moon", orbit: 26, diameter: 3.8 }],
	},
	{
		name: "mars",
		diameter: 10,
		moons: [
			{ name: "phobos", orbit: 7.5, diameter: 0.7 },
			{ name: "deimos", orbit: 10, diameter: 0.5 },
		],
	},
	{
		name: "jupiter",
		diameter: 34,
		moons: [
			{ name: "io", orbit: 24, diameter: 2.4 },
			{ name: "europa", orbit: 28, diameter: 2.1 },
			{ name: "ganymede", orbit: 34, diameter: 3.5 },
			{ name: "callisto", orbit: 40, diameter: 3.2 },
		],
	},
	{
		name: "saturn",
		diameter: 28,
		ringInnerScale: SATURN_RING_INNER_SCALE,
		moons: [
			{ name: "mimas", orbit: 34, diameter: 0.6 },
			{ name: "enceladus", orbit: 36.5, diameter: 0.7 },
			{ name: "tethys", orbit: 39, diameter: 1.1 },
			{ name: "dione", orbit: 42, diameter: 1.2 },
			{ name: "rhea", orbit: 45, diameter: 1.5 },
			{ name: "titan", orbit: 51, diameter: 3.4 },
			{ name: "iapetus", orbit: 57, diameter: 1.4 },
		],
	},
	{
		name: "uranus",
		diameter: 18,
		moons: [
			{ name: "miranda", orbit: 12, diameter: 0.6 },
			{ name: "ariel", orbit: 14, diameter: 1 },
			{ name: "umbriel", orbit: 16.5, diameter: 1 },
			{ name: "titania", orbit: 20, diameter: 1.3 },
			{ name: "oberon", orbit: 23, diameter: 1.3 },
		],
	},
	{
		name: "neptune",
		diameter: 18,
		moons: [
			{ name: "proteus", orbit: 11.5, diameter: 0.6 },
			{ name: "triton", orbit: 15, diameter: 2.2 },
			{ name: "nereid", orbit: 22, diameter: 0.5 },
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
		expect(closestToPlanet > warehouses.outer, `${moon.name} bases clear ${planet.name}'s warehouses`);
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
	expect(earth.warehouses[0].radius === EARTH_WAREHOUSE_RADIUS, "Earth warehouses use the outer ring");
	expect(earth.stations.length === 2, "Earth has two energy stations");
	expect(earth.stations[0].faction !== earth.stations[1].faction, "Earth stations are one per faction");
	expect(earth.stations[0].radius === EARTH_STATION_RADIUS, "Earth stations use the inner ring");
	const station = span(earth.stations[0].radius, earth.stations[0].size.width);
	expect(station.inner > 7, "Earth stations clear the surface");
	expect(station.outer < 26 - 3.8 / 2, "Earth stations clear the Moon");
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("base halos clear bodies");
