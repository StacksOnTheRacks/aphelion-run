import type { Camera } from "@babylonjs/core/Cameras/camera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";

import "@babylonjs/loaders/glTF";

import { WAREHOUSE_SIZE } from "./bases";
import { createPlume, type Plume } from "./plume";
import { plumesFor, type Drive, type Plumes } from "./thrust";

/** Half the long side of a planet warehouse. */
export const HULL_LENGTH = WAREHOUSE_SIZE.depth / 2;

/**
 * The hull, its plumes, and its beacon are drawn on this layer and nothing else is. The hull is a few
 * thousandths of a world unit across, so the aft views draw the ship with its own near plane, over the world.
 * The windscreen draws none of it: the model has no real cabin, and its nose and canopy would sit in the view.
 */
export const SHIP_LAYER = 0x10000000;

/**
 * Mounts are in the ship's own units: the nose is +Z, starboard is +X, and the hull is about 17 long.
 * The eye is the middle of the pilot's visor.
 *
 * Each aft camera sits outboard of the hull, above and a little ahead of its side thruster, and looks
 * aft past it. That puts the thruster's plume across the frame when it fires.
 */
const AFT_CAMERA = { out: 0.5, up: 0.9, ahead: 3.5 };
/** The aft cameras splay outboard this far, in radians, so the hull fills only the inside edge. */
const AFT_SPLAY = 0.14;
const AFT_PITCH = 0.06;
/** Fill on the hull while piloting. The Sun rakes across it from the side and leaves the aft views black. */
const AFT_FILL = 0.6;
/**
 * Painted metal, not polished: every surface is at least this rough and at most this metallic. Glossy
 * panels caught the Sun in glints that strobed across the aft views whenever the ship turned.
 */
const HULL_ROUGHNESS = 0.8;
const HULL_METALLIC = 0.2;

/** The hull replaces the beacon once it covers this many pixels, and comes back below the lower one. */
const HULL_PIXELS_ON = 8;
const HULL_PIXELS_OFF = 6;
/** The distant marker stays this many pixels across, whatever the zoom. */
const BEACON_PIXELS = 5;

const BONE = Color3.FromHexString("#E8E4D9");

/** A heading step larger than this in one frame is a cut to a new course, not a turn. */
const CUT_ANGLE = 0.35;

type Hardpoint = "MainEngine" | "Port" | "Starboard" | "Dorsal" | "Ventral";

/** Exhaust in the ship's space: the nose is +Z, starboard is +X, and up is +Y. */
const EXHAUST: Record<Hardpoint, Vector3> = {
	MainEngine: new Vector3(0, 0, -1),
	Port: new Vector3(-1, 0, 0),
	Starboard: new Vector3(1, 0, 0),
	Dorsal: new Vector3(0, 1, 0),
	Ventral: new Vector3(0, -1, 0),
};

const PLUME_SHAPE: Record<Hardpoint, { length: number; radius: number }> = {
	MainEngine: { length: 16, radius: 1.6 },
	Port: { length: 5, radius: 0.8 },
	Starboard: { length: 5, radius: 0.8 },
	Dorsal: { length: 5, radius: 0.8 },
	Ventral: { length: 5, radius: 0.8 },
};

export type ShipModel = {
	/** Where the hull sits, in world space. */
	readonly position: Vector3;
	place: (position: Vector3, heading: Vector3, deltaSeconds: number) => void;
	/**
	 * Impulse is inner orbit: side thrusters only. Photon is the burn between bodies.
	 * `burn` is how hard that engine is working, from 0 to 1.
	 */
	drive: (leg: Drive, burn: number) => void;
	/** Radius of the beacon in CSS pixels while it is drawn. Null while the hull is showing. */
	beacon: () => number | null;
};

/** Nodes on the hull that a camera can ride. Each looks along its own +Z. */
export type ShipMounts = {
	/** The pilot's eyes, looking out the windscreen. */
	eye: TransformNode;
	/** Beside the port side thruster, looking aft. */
	port: TransformNode;
	/** Beside the starboard side thruster, looking aft. */
	starboard: TransformNode;
};

export type Ranger = ShipModel & {
	readonly mounts: ShipMounts;
	/** From the cockpit the hull always shows in the aft views, under a fill light. */
	setPiloted: (on: boolean) => void;
};

/**
 * The ranger from the Blender file. The glTF is geometry and materials only: scene lights are
 * dropped, and the engine glow materials stay dark until a plume, which is drawn here, is firing.
 * The nose is turned onto +Z so `lookAt` points it along the heading.
 */
export async function loadRanger(scene: Scene, camera: Camera): Promise<Ranger> {
	// The published site serves this from its own public folder. The copy beside this package is for the game dev server.
	const container = await LoadAssetContainerAsync("/models/ranger.glb", scene);
	container.addAllToScene();
	for (const light of container.lights) {
		light.dispose();
	}
	for (const material of container.materials) {
		if (!(material instanceof PBRMaterial)) {
			continue;
		}
		// PBR inverse-square falloff leaves the hull black at planetary distances. The sun point
		// light is what shades the rest of the system, so the hull uses that same falloff.
		material.usePhysicalLightFalloff = false;
		if (material.name === "Ranger Canopy") {
			// Dark tinted glass. It reflects nothing: a live reflection redrew the whole system six
			// times over, a dozen times a second, for a few pixels of nose.
			material.albedoColor.set(0.06, 0.07, 0.08);
			material.metallic = 0;
			material.roughness = 0.35;
			material.alpha = 1;
			material.transparencyMode = Material.MATERIAL_OPAQUE;
			material.backFaceCulling = false;
		} else {
			material.roughness = Math.max(material.roughness ?? 1, HULL_ROUGHNESS);
			material.metallic = Math.min(material.metallic ?? 1, HULL_METALLIC);
		}
		if (material.name !== "Ranger Engine Glow" && material.name !== "Ranger Intake Glow") {
			continue;
		}
		material.emissiveColor.set(0, 0, 0);
		material.emissiveIntensity = 0;
	}
	for (const mesh of container.meshes) {
		mesh.isPickable = false;
		mesh.layerMask = SHIP_LAYER;
		// The loader's mirrored root puts the world bounds off the mesh, and a close camera then
		// culls a hull that is sitting in frame.
		mesh.alwaysSelectAsActiveMesh = true;
	}
	const pilotBody = container.meshes.filter((mesh) => mesh.name.startsWith("Ranger Pilot"));

	const ship = new TransformNode("player-ship", scene);
	// The loader mirrors Z and turns the model around so the glTF axes match a left-handed scene.
	// That leaves the nose on -Z. This node turns it onto +Z without touching the loader's root.
	const facing = new TransformNode("ranger-facing", scene);
	facing.parent = ship;
	facing.rotation.y = Math.PI;
	const root = container.rootNodes[0];
	if (!root) {
		throw new Error("The ranger model is empty.");
	}
	root.parent = facing;

	facing.computeWorldMatrix(true);
	const bounds = facing.getHierarchyBoundingVectors(true);
	const length = bounds.max.z - bounds.min.z;
	if (length < 1e-3) {
		throw new Error("The ranger hull has no length.");
	}
	ship.scaling.setAll(HULL_LENGTH / length);

	const plumes = new Map<Hardpoint, Plume>();
	for (const name of Object.keys(EXHAUST) as Hardpoint[]) {
		const hardpoint = scene.getTransformNodeByName(name);
		if (!hardpoint) {
			throw new Error(`The ranger is missing the ${name} hardpoint.`);
		}
		const plume = createPlume(scene, name, PLUME_SHAPE[name], SHIP_LAYER);
		plume.root.parent = hardpoint;
		aimPlume(plume.root, hardpoint, EXHAUST[name]);
		plume.set(0, false);
		plumes.set(name, plume);
	}

	const beaconMaterial = new StandardMaterial("ranger-beacon", scene);
	beaconMaterial.emissiveColor = BONE;
	beaconMaterial.diffuseColor = BONE;
	beaconMaterial.specularColor = Color3.Black();
	beaconMaterial.disableLighting = true;
	const beacon = MeshBuilder.CreateSphere("ranger-beacon", { diameter: 1, segments: 8 }, scene);
	beacon.material = beaconMaterial;
	beacon.parent = ship;
	beacon.isPickable = false;
	beacon.alwaysSelectAsActiveMesh = true;
	beacon.layerMask = SHIP_LAYER;

	const mounts = buildMounts(scene, ship, pilotBody);

	// Only reaches the ship. It stays in the scene at zero, so turning it up does not rebuild shaders.
	const fillLight = new HemisphericLight("ranger-fill", Vector3.Up(), scene);
	fillLight.includeOnlyWithLayerMask = SHIP_LAYER;
	fillLight.diffuse = BONE;
	fillLight.groundColor = Color3.FromHexString("#3A3630");
	fillLight.specular = Color3.Black();
	fillLight.intensity = 0;

	const engine = scene.getEngine();
	const shown: Plumes = { main: 0, port: 0, starboard: 0, dorsal: 0, ventral: 0 };
	const previous = new Vector3();
	let hasPrevious = false;
	let leg: Drive = "impulse";
	let burn = 0;
	let hullOn = false;
	let piloted = false;
	const aim = new Vector3();

	const worldPerPixel = (position: Vector3) => {
		const cssHeight = Math.max(1, engine.getRenderHeight() * engine.getHardwareScalingLevel());
		return (2 * Vector3.Distance(camera.globalPosition, position) * Math.tan(camera.fov / 2)) / cssHeight;
	};

	const pairs: { hardpoint: Hardpoint; field: keyof Plumes }[] = [
		{ hardpoint: "MainEngine", field: "main" },
		{ hardpoint: "Port", field: "port" },
		{ hardpoint: "Starboard", field: "starboard" },
		{ hardpoint: "Dorsal", field: "dorsal" },
		{ hardpoint: "Ventral", field: "ventral" },
	];

	const applyPlumes = (target: Plumes, deltaSeconds: number) => {
		const follow = deltaSeconds <= 0 ? 1 : 1 - Math.exp(-deltaSeconds * 10);
		for (const pair of pairs) {
			shown[pair.field] += (target[pair.field] - shown[pair.field]) * follow;
			const plume = plumes.get(pair.hardpoint);
			if (!plume) {
				continue;
			}
			plume.set(shown[pair.field], hullOn);
		}
	};

	const present = () => {
		const pixels = HULL_LENGTH / worldPerPixel(ship.getAbsolutePosition());
		if (piloted) {
			hullOn = true;
		} else if (hullOn) {
			if (pixels < HULL_PIXELS_OFF) {
				hullOn = false;
			}
		} else if (pixels >= HULL_PIXELS_ON) {
			hullOn = true;
		}
		facing.setEnabled(hullOn);
		beacon.setEnabled(!hullOn);
		if (!hullOn) {
			const parentScale = Math.abs(ship.scaling.x) || 1;
			beacon.scaling.setAll((BEACON_PIXELS * worldPerPixel(ship.getAbsolutePosition())) / parentScale);
		}
	};

	return {
		get position() {
			return ship.position;
		},
		drive(next, strength) {
			leg = next;
			burn = strength;
		},
		place(position, heading, deltaSeconds) {
			let yawRate = 0;
			let pitchRate = 0;
			if (hasPrevious && deltaSeconds > 1e-4) {
				const step = yawAngle(previous, heading);
				const pitch = heading.y - previous.y;
				if (Math.abs(step) <= CUT_ANGLE && Math.abs(pitch) <= CUT_ANGLE) {
					yawRate = step / deltaSeconds;
					pitchRate = pitch / deltaSeconds;
				}
			}
			hasPrevious = true;
			previous.copyFrom(heading);
			ship.position.copyFrom(position);
			aim.copyFrom(position).addInPlace(heading);
			if (Vector3.DistanceSquared(aim, position) > 1e-8) {
				ship.lookAt(aim);
			}
			present();
			applyPlumes(plumesFor(leg, yawRate, pitchRate, burn), deltaSeconds);
		},
		beacon() {
			return hullOn ? null : BEACON_PIXELS / 2;
		},
		mounts,
		setPiloted(on) {
			piloted = on;
			fillLight.intensity = on ? AFT_FILL : 0;
			present();
		},
	};
}

/**
 * The eye goes where the pilot's visor is, and each aft camera goes beside its side thruster. Both are
 * measured off the model, so they follow it if the hull is rebuilt.
 */
function buildMounts(scene: Scene, ship: TransformNode, pilotBody: AbstractMesh[]): ShipMounts {
	ship.computeWorldMatrix(true);
	const toShip = ship.getWorldMatrix().clone().invert();
	const local = (world: Vector3) => Vector3.TransformCoordinates(world, toShip);
	// The hull was just scaled, so every matrix from the ship down is stale until it is recomputed in order.
	const refresh = (node: Node) => {
		const chain: Node[] = [];
		for (let at: Node | null = node; at; at = at.parent) {
			chain.unshift(at);
		}
		for (const link of chain) {
			if (link instanceof TransformNode) {
				link.computeWorldMatrix(true);
			}
		}
	};

	const visor = pilotBody.filter((mesh) => mesh.name.startsWith("Ranger Pilot Visor"));
	if (visor.length === 0) {
		throw new Error("The ranger is missing the pilot's visor.");
	}
	const min = new Vector3(Infinity, Infinity, Infinity);
	const max = new Vector3(-Infinity, -Infinity, -Infinity);
	for (const mesh of visor) {
		refresh(mesh);
		const box = mesh.getBoundingInfo().boundingBox;
		min.minimizeInPlace(local(box.minimumWorld));
		max.maximizeInPlace(local(box.maximumWorld));
	}
	const center = min.add(max).scale(0.5);

	const eye = new TransformNode("ranger-eye", scene);
	eye.parent = ship;
	eye.position.copyFrom(center);
	eye.position.x = 0;

	const aft = (name: "Port" | "Starboard", side: number) => {
		const hardpoint = scene.getTransformNodeByName(name);
		if (!hardpoint) {
			throw new Error(`The ranger is missing the ${name} hardpoint.`);
		}
		refresh(hardpoint);
		const at = local(hardpoint.getAbsolutePosition());
		const mount = new TransformNode(`ranger-aft-${name.toLowerCase()}`, scene);
		mount.parent = ship;
		mount.position.set(at.x + side * AFT_CAMERA.out, at.y + AFT_CAMERA.up, at.z + AFT_CAMERA.ahead);
		mount.rotation.set(AFT_PITCH, Math.PI - side * AFT_SPLAY, 0);
		return mount;
	};

	return { eye, port: aft("Port", -1), starboard: aft("Starboard", 1) };
}

/** Signed angle from `previous` to `next` about Y. Positive swings the nose to starboard. */
function yawAngle(previous: Vector3, next: Vector3): number {
	const forward = new Vector3(previous.x, 0, previous.z);
	const ahead = new Vector3(next.x, 0, next.z);
	if (forward.lengthSquared() < 1e-8 || ahead.lengthSquared() < 1e-8) {
		return 0;
	}
	forward.normalize();
	ahead.normalize();
	const right = Vector3.Cross(Vector3.Up(), forward);
	return Math.atan2(Vector3.Dot(ahead, right), Vector3.Dot(ahead, forward));
}

/**
 * Points the plume's +Z along `exhaust` in ship space.
 * The glTF root mirrors Z, and a child rotation is applied before that mirror, so the direction
 * solved from the inverse world matrix points back into the hull. Negating it sends the cone out the nozzle.
 */
function aimPlume(plume: TransformNode, hardpoint: TransformNode, exhaust: Vector3): void {
	hardpoint.computeWorldMatrix(true);
	const inverse = new Matrix();
	hardpoint.getWorldMatrix().invertToRef(inverse);
	const local = Vector3.TransformNormal(exhaust.scale(-1), inverse).normalize();
	const hint = Math.abs(Vector3.Dot(local, Vector3.Up())) > 0.85 ? Vector3.Forward() : Vector3.Up();
	plume.rotationQuaternion = Quaternion.FromLookDirectionLH(local, hint);
}
