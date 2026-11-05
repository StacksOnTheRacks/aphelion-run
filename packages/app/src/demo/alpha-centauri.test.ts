import {
	BINARY_APASTRON,
	BINARY_AXIS,
	BINARY_ECCENTRICITY,
	BINARY_PERIASTRON,
	PROXIMA_AXIS,
	PROXIMA_ECCENTRICITY,
	RIGIL_MASS,
	TOLIMAN_MASS,
	alphaChartSteps,
	alphaLabels,
	alphaPlaque,
	binaryPlaces,
	chartDistance,
	chartGap,
	chartStars,
	orbitRadius,
	orbitStyle,
	proximaPlace,
	starLight,
	trueAnomaly,
} from "./alpha-centauri";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

function cross(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
	const x = a.y * b.z - a.z * b.y;
	const y = a.z * b.x - a.x * b.z;
	const z = a.x * b.y - a.y * b.x;
	return Math.hypot(x, y, z);
}

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

expect(Math.abs(trueAnomaly(0, BINARY_ECCENTRICITY)) < 1e-9, "mean anomaly 0 is periastron");
expect(Math.abs(trueAnomaly(Math.PI, BINARY_ECCENTRICITY) - Math.PI) < 1e-6, "mean anomaly π is apastron");
expect(
	Math.abs(orbitRadius(BINARY_AXIS, BINARY_ECCENTRICITY, 0) - BINARY_PERIASTRON) < 1e-9,
	"the pair's closest gap is the periastron"
);
expect(
	Math.abs(orbitRadius(BINARY_AXIS, BINARY_ECCENTRICITY, Math.PI) - BINARY_APASTRON) < 1e-9,
	"the pair's widest gap is the apastron"
);

for (let step = 0; step < 24; step++) {
	const mean = (step / 24) * Math.PI * 2;
	const pair = binaryPlaces(mean);
	expect(
		pair.separation >= BINARY_PERIASTRON - 1e-6 && pair.separation <= BINARY_APASTRON + 1e-6,
		`the gap at mean anomaly ${mean.toFixed(2)} stays between periastron and apastron`
	);
	expect(Math.abs(chartGap(pair.rigil, pair.toliman) - pair.separation) < 1e-6, "the gap is the distance between the stars");
	const rigilDistance = chartDistance(pair.rigil);
	const tolimanDistance = chartDistance(pair.toliman);
	expect(rigilDistance < tolimanDistance, "Rigil, the heavier star, stays closer to the barycenter");
	expect(
		Math.abs(rigilDistance * RIGIL_MASS - tolimanDistance * TOLIMAN_MASS) < 1e-6,
		"the two stars balance across the barycenter"
	);
	expect(dot(pair.rigil, pair.toliman) < 0, "the stars sit on opposite sides of the barycenter");
	const scale = rigilDistance * tolimanDistance;
	expect(cross(pair.rigil, pair.toliman) < scale * 1e-6, "the stars and the barycenter stay on one line");
}

const proxima = proximaPlace();
const proximaDistance = chartDistance(proxima);
const proximaNear = PROXIMA_AXIS * (1 - PROXIMA_ECCENTRICITY);
const proximaFar = PROXIMA_AXIS * (1 + PROXIMA_ECCENTRICITY);
expect(
	proximaDistance >= proximaNear - 1e-6 && proximaDistance <= proximaFar + 1e-6,
	"Proxima stays on its chart ellipse"
);
expect(proximaDistance > BINARY_APASTRON * 2, "Proxima's chart orbit sits well outside the pair");

expect(orbitStyle("proxima-c") === "dashed", "Proxima c's path is the candidate style");
for (const id of ["proxima-b", "proxima-d", "kentaurus", "rigil", "harbor"]) {
	expect(orbitStyle(id) === "solid", `${id} has a solid path`);
}

const systemSteps = alphaChartSteps("system");
expect(systemSteps.length === 1 && systemSteps[0].target === "galaxy", "the system chart steps back to the galaxy");
const rigilSteps = alphaChartSteps("rigil");
expect(rigilSteps.length === 1 && rigilSteps[0].label === "System" && rigilSteps[0].target === "system", "a star steps back to the system");
const cinderSteps = alphaChartSteps("cinder");
expect(cinderSteps.length === 1 && cinderSteps[0].label === "Sun" && cinderSteps[0].target === "rigil", "Rigil's world steps back to Rigil");
const gleamSteps = alphaChartSteps("gleam");
expect(gleamSteps.length === 1 && gleamSteps[0].label === "Planet" && gleamSteps[0].target === "lumen", "a moon steps back to its world");

const systemNames = alphaLabels("system").map((item) => item.id);
expect(
	systemNames.includes("rigil") && systemNames.includes("toliman") && systemNames.includes("proxima") && systemNames.includes("kentaurus") && systemNames.includes("harbor"),
	"the system chart names the three stars and the two circumbinary worlds"
);
expect(!systemNames.includes("cinder") && !systemNames.includes("proxima-b"), "a star's worlds wait until that star is open");
const proximaNames = alphaLabels("proxima").map((item) => item.id);
expect(
	proximaNames.includes("proxima-d") && proximaNames.includes("proxima-b") && proximaNames.includes("proxima-c"),
	"Proxima's chart names d, b, and c"
);
expect(alphaLabels("proxima").find((item) => item.id === "proxima-c")?.note === "Unconfirmed", "Proxima c is marked unconfirmed");

const plaque = alphaPlaque("system");
expect(plaque.title === "Alpha Centauri" && plaque.detail === null, "the system plaque names the system");
expect(alphaPlaque("cinder").title === "Cinder" && alphaPlaque("cinder").detail === null, "a world plaque names the world");
expect(alphaPlaque("proxima-c").title === "Proxima c" && alphaPlaque("proxima-c").detail === null, "Proxima c's plaque names the world");

const besideToliman = starLight({ x: -200, y: 0, z: 0 }, [
	{ id: "rigil", at: { x: 60, y: 0, z: 0 } },
	{ id: "toliman", at: { x: -70, y: 0, z: 0 } },
]);
expect(besideToliman[0]?.id === "toliman" && besideToliman[0].reach === 1, "a world nearer Toliman takes its light from Toliman");
expect(
	besideToliman[1]?.id === "rigil" && besideToliman[1].reach < 0.3,
	"Rigil, twice as far, gives about a quarter of the light"
);
const besideRigil = starLight({ x: 80, y: 0, z: 0 }, [
	{ id: "rigil", at: { x: 60, y: 0, z: 0 } },
	{ id: "toliman", at: { x: -70, y: 0, z: 0 } },
]);
expect(besideRigil[0]?.id === "rigil", "a world nearer Rigil takes its light from Rigil");
expect(chartStars("pair").join() === "rigil,toliman", "a circumbinary world is lit by the pair, not by Proxima drawn in beside it");
expect(chartStars("proxima").join() === "proxima", "Proxima's worlds are lit by Proxima");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("The pair balances, Proxima stays outside it, and only the candidate path is dashed");
