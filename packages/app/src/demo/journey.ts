import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import {
	GreasedLineMeshColorDistributionType,
	GreasedLineMeshMaterialType,
	type IGreasedLineMaterial,
} from "@babylonjs/core/Materials/GreasedLine/greasedLineMaterialInterfaces";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGreasedLine } from "@babylonjs/core/Meshes/Builders/greasedLineBuilder";
import type { GreasedLineBaseMesh } from "@babylonjs/core/Meshes/GreasedLine/greasedLineBaseMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { headingAt, pointAt, type Route } from "./route";

/**
 * A ship flying a planned route. The way ahead is a bright line that shortens as the ship goes;
 * the way behind is a dim dashed line that grows. Both are drawn at a fixed width on screen, so the
 * route reads from the whole-system view and from beside a planet alike. Nothing here moves the camera.
 */

/** World units a ship covers per second, on average. Neptune to the Sun takes about 40 seconds. */
export const JOURNEY_PACE = 28;
/** A hop between neighbours still lasts long enough to watch; the longest trips are capped. */
export const JOURNEY_MIN_SECONDS = 8;
export const JOURNEY_MAX_SECONDS = 60;

export function journeySeconds(total: number): number {
	return Math.min(JOURNEY_MAX_SECONDS, Math.max(JOURNEY_MIN_SECONDS, total / JOURNEY_PACE));
}

/** Ship length on screen, in CSS pixels. */
const SHIP_PIXELS = 14;
/** Line widths on screen, in CSS pixels. */
const AHEAD_WIDTH = 3;
const BEHIND_WIDTH = 1.6;
/** An assist costs less, so its stretch of the line is drawn at this share of the width. */
const ASSIST_WIDTH = 0.5;
/** World units per dash on the travelled line. */
const DASH_LENGTH = 12;
/** A short hop is viewed up close, so it still gets enough dashes to read as dashed. */
const MIN_DASHES = 24;

const BONE = Color3.FromHexString("#E8E4D9");
const AMBER = Color3.FromHexString("#FCD34D");
const ENERGY = Color3.FromHexString("#F5E6C8");
const BEHIND = BONE.scale(0.42);

export type Journey = {
	start: (route: Route, onDone: () => void) => void;
	/** Clears the ship and both lines without calling `onDone`. */
	stop: () => void;
	update: (deltaSeconds: number) => void;
};

type Flight = {
	route: Route;
	onDone: () => void;
	elapsed: number;
	ahead: GreasedLineBaseMesh;
	behind: GreasedLineBaseMesh;
};

export function createJourney(scene: Scene, camera: Camera, glow: GlowLayer): Journey {
	const engine = scene.getEngine();
	const ship = buildShip(scene);
	let flight: Flight | null = null;

	const pixelRatio = () => 1 / engine.getHardwareScalingLevel();

	const clear = () => {
		if (!flight) {
			return;
		}
		flight.ahead.dispose(false, true);
		flight.behind.dispose(false, true);
		ship.setEnabled(false);
		flight = null;
	};

	const placeShip = (route: Route, distance: number) => {
		const position = pointAt(route, distance);
		ship.position.copyFrom(position);
		ship.lookAt(position.add(headingAt(route, distance)));
		const fov = camera.fov;
		const cssHeight = engine.getRenderHeight() / pixelRatio();
		const worldPerPixel = (2 * Vector3.Distance(camera.globalPosition, position) * Math.tan(fov / 2)) / cssHeight;
		ship.scaling.setAll(SHIP_PIXELS * worldPerPixel);
	};

	return {
		start(route, onDone) {
			clear();
			const ahead = buildAhead(scene, route, pixelRatio());
			const behind = buildBehind(scene, route, pixelRatio());
			glow.addExcludedMesh(ahead);
			glow.addExcludedMesh(behind);
			flight = { route, onDone, elapsed: 0, ahead, behind };
			ship.setEnabled(true);
			placeShip(route, 0);
		},
		stop: clear,
		update(deltaSeconds) {
			if (!flight) {
				return;
			}
			flight.elapsed += deltaSeconds;
			const linear = Math.min(1, flight.elapsed / journeySeconds(flight.route.total));
			const progress = linear * linear * (3 - 2 * linear);
			if (linear >= 1) {
				const done = flight.onDone;
				clear();
				done();
				return;
			}
			const resolution = new Vector2(engine.getRenderWidth(), engine.getRenderHeight());
			for (const line of [flight.ahead, flight.behind]) {
				const material = line.greasedLineMaterial as IGreasedLineMaterial;
				if (!material.resolution.equals(resolution)) {
					material.resolution = resolution;
				}
			}
			(flight.behind.greasedLineMaterial as IGreasedLineMaterial).visibility = progress;
			(flight.ahead.greasedLineMaterial as IGreasedLineMaterial).visibility = 1 - progress;
			placeShip(flight.route, progress * flight.route.total);
		},
	};
}

/**
 * The way ahead, built from the end backwards: visibility shows a line from its first point, so
 * reversing it shows the part between the ship and the destination.
 */
function buildAhead(scene: Scene, route: Route, pixelRatio: number): GreasedLineBaseMesh {
	const points = [...route.points].reverse();
	const kinds = [...route.kinds].reverse();
	const widths: number[] = [];
	const colors: Color3[] = [];
	for (let i = 0; i < points.length; i++) {
		const before = kinds[i - 1];
		const after = kinds[i];
		// Arc ends keep the full width, so a pass narrows over its first step and widens over its last.
		const width = before === "assist" && after === "assist" ? ASSIST_WIDTH : 1;
		widths.push(width, width);
		colors.push((after ?? before) === "assist" ? ENERGY : AMBER);
	}
	const line = CreateGreasedLine(
		"journey-ahead",
		{ points, widths },
		{
			materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_SIMPLE,
			sizeAttenuation: true,
			width: AHEAD_WIDTH * pixelRatio,
			useColors: true,
			colors,
			colorDistributionType: GreasedLineMeshColorDistributionType.COLOR_DISTRIBUTION_TYPE_SEGMENT,
			visibility: 1,
		},
		scene
	);
	line.isPickable = false;
	return line;
}

function buildBehind(scene: Scene, route: Route, pixelRatio: number): GreasedLineBaseMesh {
	const line = CreateGreasedLine(
		"journey-behind",
		{ points: route.points },
		{
			materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_SIMPLE,
			sizeAttenuation: true,
			width: BEHIND_WIDTH * pixelRatio,
			color: BEHIND,
			useDash: true,
			dashCount: Math.max(MIN_DASHES, Math.round(route.total / DASH_LENGTH)),
			dashRatio: 0.5,
			visibility: 0,
		},
		scene
	);
	line.isPickable = false;
	return line;
}

/** A four-sided dart, one unit long, nose along +Z, so it reads as pointing from any angle. */
function buildShip(scene: Scene): Mesh {
	const ship = MeshBuilder.CreateCylinder(
		"journey-ship",
		{ height: 1, diameterTop: 0, diameterBottom: 0.45, tessellation: 4 },
		scene
	);
	ship.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));
	const material = new StandardMaterial("journey-ship", scene);
	material.emissiveColor = BONE;
	material.diffuseColor = BONE;
	material.disableLighting = true;
	ship.material = material;
	ship.isPickable = false;
	ship.setEnabled(false);
	return ship;
}
