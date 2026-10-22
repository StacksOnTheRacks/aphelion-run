import {
	EARTH_STATION_RADIUS,
	EARTH_WAREHOUSE_RADIUS,
	SATURN_RING_INNER_SCALE,
	WAREHOUSE_SIZE,
	moonBaseRadius,
	moonBaseSize,
	moonOuterOrbitRadius,
	outerOrbitRadius,
	radialReach,
	warehouseRadius,
	type PlanetBaseInput,
} from "./bases";
import { PLANET_YIELDS, moonGeneratorSlots, planetGeneratorSlots, type Mineral } from "./generators";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

type MoonFixture = { name: string; orbit: number; diameter: number };
type PlanetFixture = PlanetBaseInput & { name: string; moons: MoonFixture[] };

/** Diameters and moon orbits from the environment demo. */
const PLANETS: PlanetFixture[] = [
	{ name: "mercury", diameter: 8, moons: [] },
	{ name: "venus", diameter: 12, moons: [] },
	{
		name: "earth",
		diameter: 14,
		homes: false,
		warehouseRadius: EARTH_WAREHOUSE_RADIUS,
		stationRadius: EARTH_STATION_RADIUS,
		moons: [{ name: "moon", orbit: 52, diameter: 3.8 }],
	},
	{
		name: "mars",
		diameter: 10,
		moons: [
			{ name: "phobos", orbit: 15, diameter: 0.7 },
			{ name: "deimos", orbit: 20, diameter: 0.5 },
		],
	},
	{
		name: "jupiter",
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
		diameter: 18,
		moons: [
			{ name: "proteus", orbit: 23, diameter: 0.6 },
			{ name: "triton", orbit: 30, diameter: 2.2 },
			{ name: "nereid", orbit: 44, diameter: 0.5 },
		],
	},
];

const SHEET: Record<string, readonly Mineral[]> = {
	mercury: ["ore", "hydrogen"],
	venus: ["ore", "nitrogen", "carbon"],
	mars: ["ore", "carbon", "hydrogen"],
	jupiter: ["hydrogen", "ore"],
	saturn: ["hydrogen", "nitrogen", "carbon"],
	uranus: ["hydrogen", "nitrogen", "carbon"],
	neptune: ["hydrogen", "nitrogen", "carbon"],
};

expect(JSON.stringify(PLANET_YIELDS) === JSON.stringify(SHEET), "planet yields match the generators tab");

for (const planet of PLANETS) {
	const slots = planetGeneratorSlots(planet.name, planet);
	const yields = SHEET[planet.name] ?? [];
	expect(
		slots.map((slot) => slot.resource).join() === yields.join(),
		`${planet.name} has one generator per mineral`
	);
	const homeOuter = warehouseRadius(planet) + radialReach(WAREHOUSE_SIZE);
	const surface = planet.diameter / 2;
	const limit = planet.ringInnerScale != null ? surface * planet.ringInnerScale : outerOrbitRadius(planet);
	for (const slot of slots) {
		const reach = radialReach(slot.size);
		expect(slot.radius - reach > homeOuter, `${planet.name} ${slot.resource} generator clears the homes`);
		expect(slot.radius + reach < limit, `${planet.name} ${slot.resource} generator stays inside the inner orbit`);
		expect(slot.size.width > 0 && slot.size.height > 0 && slot.size.depth > 0, `${planet.name} generator is a box`);
	}
	const angles = new Set(slots.map((slot) => slot.angle.toFixed(6)));
	expect(angles.size === slots.length, `${planet.name} generators do not share an angle`);

	for (const moon of planet.moons) {
		const moonSlots = moonGeneratorSlots(planet.name, moon.diameter);
		expect(
			moonSlots.map((slot) => slot.resource).join() === yields.join(),
			`${moon.name} uses ${planet.name}'s yield`
		);
		const bases = moonBaseRadius(moon.diameter) + radialReach(moonBaseSize(moon.diameter));
		const outer = moonOuterOrbitRadius(moon.diameter);
		for (const slot of moonSlots) {
			const reach = radialReach(slot.size);
			expect(slot.radius - reach > bases, `${moon.name} ${slot.resource} generator clears the homes`);
			expect(slot.radius + reach < outer, `${moon.name} ${slot.resource} generator stays inside the outer orbit`);
			expect(slot.size.width < moon.diameter, `${moon.name} generator is smaller than the moon`);
		}
	}
}

expect(planetGeneratorSlots("earth", PLANETS[2]).length === 0, "Earth has no mine generators");
expect(moonGeneratorSlots("earth", 3.8).length === 0, "the Moon has no mine generators");

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("generators sit on the inner orbit, one gray box per mineral");
