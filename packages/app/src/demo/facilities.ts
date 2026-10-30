import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";

import "@babylonjs/loaders/glTF";

import { MINE_SIZE } from "./bases";
import type { Mineral } from "./generators";

/**
 * The Blender spheres are radius 1. The game's mine is a sphere of `MINE_SIZE.depth`,
 * which is what the ship already docks against.
 */
const MODEL_SCALE = MINE_SIZE.depth / 2;
/**
 * The loader leaves the bore, the face toward the body, on +X. Orbit yaw sends +X
 * outward, so this extra half-turn points the bore inward before that yaw.
 */
const FACE_INWARD = Math.PI;
/** How fast an iris eases open or shut. */
const IRIS_EASE = 8;

/**
 * A band of the mineral's color on an otherwise carbon hull.
 * Carbon itself is amber, so it still reads against the gray weave.
 */
const ACCENT: Record<Mineral, Color3> = {
	hydrogen: Color3.FromHexString("#7ED4F0"),
	ore: Color3.FromHexString("#C46A3A"),
	nitrogen: Color3.FromHexString("#6C7CFF"),
	carbon: Color3.FromHexString("#E2B15A"),
};

type Aperture = {
	blades: AbstractMesh[];
	rest: Quaternion[];
	/** Radians from shut to open, around each blade's local Y. */
	openAngle: number;
	amount: number;
};

export type Facility = {
	readonly root: TransformNode;
	/** Distance from the center to the bore iris, in world units. The mine's beam starts there. */
	readonly boreInset: number;
	/** World position of the access port that faces `ship`. Null when the ship is not alongside. */
	portPoint: (ship: Vector3, out: Vector3) => Vector3 | null;
	/**
	 * `bore` opens the face toward the body. `ship` opens the access port on that side.
	 * Null shuts both side ports.
	 */
	update: (bore: boolean, ship: Vector3 | null, deltaSeconds: number) => void;
};

export type FacilityKit = {
	placeMine: (parent: TransformNode, id: string, resource: Mineral) => Facility;
	/** One closed collector, for the thin-instance swarm. The bore already faces +X. */
	collectorMesh: () => Mesh;
	/** The one collector that can open a port. Hidden until a ship docks. */
	liveCollector: () => Facility;
};

const swing = new Quaternion();
const localShip = new Vector3();
const localPort = new Vector3();
const localStarboard = new Vector3();

/** Which access port the ship is outside. Both directions are in the facility's space. */
export function portToward(ship: Vector3, port: Vector3, starboard: Vector3): "port" | "starboard" {
	return Vector3.Dot(ship, port) >= Vector3.Dot(ship, starboard) ? "port" : "starboard";
}

function tune(material: Material | null): void {
	if (material instanceof PBRMaterial) {
		// The sun is a point light at planetary distances. Physical falloff leaves the hull black.
		material.usePhysicalLightFalloff = false;
	}
}

function paintAccent(root: Node, resource: Mineral): void {
	const color = ACCENT[resource];
	for (const mesh of childMeshes(root)) {
		if (!mesh.name.includes("Accent") || !(mesh.material instanceof PBRMaterial)) {
			continue;
		}
		const material = mesh.material.clone(`accent-${resource}-${mesh.uniqueId}`);
		if (!(material instanceof PBRMaterial)) {
			continue;
		}
		material.albedoColor = color;
		material.emissiveColor = color.scale(0.45);
		material.emissiveIntensity = 0.7;
		tune(material);
		mesh.material = material;
	}
}

function childMeshes(root: Node): Mesh[] {
	const found: Mesh[] = [];
	const visit = (node: Node) => {
		if (node instanceof Mesh) {
			found.push(node);
		}
		for (const child of node.getChildren()) {
			visit(child);
		}
	};
	visit(root);
	return found;
}

function findNamed(root: Node, suffix: string): TransformNode | null {
	if (root instanceof TransformNode && root.name.endsWith(suffix)) {
		return root;
	}
	for (const child of root.getChildren()) {
		const found = findNamed(child, suffix);
		if (found) {
			return found;
		}
	}
	return null;
}

function replicate(source: Node, parent: TransformNode | null, id: string): TransformNode {
	const name = `${id}.${source.name}`;
	let copy: TransformNode;
	if (source instanceof Mesh && source.getTotalVertices() > 0) {
		const inst = source.createInstance(name);
		inst.isPickable = false;
		inst.alwaysSelectAsActiveMesh = true;
		copy = inst;
	} else {
		copy = new TransformNode(name, source.getScene());
	}
	copy.parent = parent;
	if (source instanceof TransformNode) {
		copy.position.copyFrom(source.position);
		copy.scaling.copyFrom(source.scaling);
		if (source.rotationQuaternion) {
			copy.rotationQuaternion = source.rotationQuaternion.clone();
		} else {
			copy.rotation.copyFrom(source.rotation);
		}
	}
	for (const child of source.getChildren()) {
		replicate(child, copy, id);
	}
	return copy;
}

/**
 * The collector's orange is a bright texture. Next to the Sun that clips to white, so the hull is
 * held down and given an orange glow, and the solar cap keeps a little blue of its own.
 */
function dressCollector(root: Node): void {
	for (const mesh of childMeshes(root)) {
		const material = mesh.material;
		if (!(material instanceof PBRMaterial)) {
			continue;
		}
		if (material.name.includes("Orange")) {
			material.albedoColor.set(0.42, 0.42, 0.42);
			material.emissiveColor.set(0.28, 0.09, 0.015);
			material.emissiveIntensity = 0.45;
		} else if (material.name.includes("Solar")) {
			material.emissiveColor.set(0.02, 0.05, 0.12);
			material.emissiveIntensity = 0.6;
		}
	}
}

function hideTemplate(root: Node): void {
	if (root instanceof Mesh) {
		root.isVisible = false;
		root.isPickable = false;
	}
	for (const child of root.getChildren()) {
		hideTemplate(child);
	}
}

function apertureOf(pivot: TransformNode | null): Aperture | null {
	if (!pivot) {
		return null;
	}
	const blades = pivot.getChildMeshes(true).filter((mesh) => mesh.name.includes("Iris"));
	if (blades.length === 0) {
		return null;
	}
	const extras = pivot.metadata as { gltf?: { extras?: { open_radians?: number } } } | null;
	const openAngle = extras?.gltf?.extras?.open_radians ?? 1.29;
	return {
		blades,
		rest: blades.map((blade) => (blade.rotationQuaternion ?? Quaternion.Identity()).clone()),
		openAngle,
		amount: 0,
	};
}

function ease(aperture: Aperture | null, open: boolean, deltaSeconds: number): void {
	if (!aperture) {
		return;
	}
	const target = open ? 1 : 0;
	const follow = deltaSeconds <= 0 ? 1 : 1 - Math.exp(-deltaSeconds * IRIS_EASE);
	let amount = aperture.amount + (target - aperture.amount) * follow;
	if (Math.abs(amount - target) < 0.001) {
		amount = target;
	}
	if (amount === aperture.amount) {
		return;
	}
	aperture.amount = amount;
	Quaternion.RotationAxisToRef(Vector3.Up(), amount * aperture.openAngle, swing);
	aperture.blades.forEach((blade, index) => {
		const rest = aperture.rest[index];
		if (!rest) {
			return;
		}
		blade.rotationQuaternion = rest.multiply(swing);
	});
}

function facilityOf(
	spin: TransformNode,
	borePivot: TransformNode | null,
	portPivot: TransformNode,
	starboardPivot: TransformNode,
	bore: Aperture | null,
	port: Aperture,
	starboard: Aperture
): Facility {
	spin.computeWorldMatrix(true);
	const center = spin.getAbsolutePosition();
	const boreInset = borePivot ? Vector3.Distance(center, borePivot.getAbsolutePosition()) : MODEL_SCALE;
	const inv = spin.getWorldMatrix().clone();
	return {
		root: spin,
		boreInset,
		portPoint(ship, out) {
			spin.computeWorldMatrix(true);
			spin.getWorldMatrix().invertToRef(inv);
			Vector3.TransformCoordinatesToRef(ship, inv, localShip);
			Vector3.TransformCoordinatesToRef(portPivot.getAbsolutePosition(), inv, localPort);
			Vector3.TransformCoordinatesToRef(starboardPivot.getAbsolutePosition(), inv, localStarboard);
			const side = portToward(localShip, localPort, localStarboard);
			out.copyFrom((side === "port" ? portPivot : starboardPivot).getAbsolutePosition());
			return out;
		},
		update(openBore, ship, deltaSeconds) {
			ease(bore, openBore, deltaSeconds);
			let side: "port" | "starboard" | null = null;
			if (ship) {
				spin.computeWorldMatrix(true);
				spin.getWorldMatrix().invertToRef(inv);
				Vector3.TransformCoordinatesToRef(ship, inv, localShip);
				Vector3.TransformCoordinatesToRef(portPivot.getAbsolutePosition(), inv, localPort);
				Vector3.TransformCoordinatesToRef(starboardPivot.getAbsolutePosition(), inv, localStarboard);
				side = portToward(localShip, localPort, localStarboard);
			}
			ease(port, side === "port", deltaSeconds);
			ease(starboard, side === "starboard", deltaSeconds);
		},
	};
}

function requireNode(root: Node, suffix: string): TransformNode {
	const found = findNamed(root, suffix);
	if (!found) {
		throw new Error(`The facility model is missing ${suffix}.`);
	}
	return found;
}

async function loadTemplates(scene: Scene, file: string, count: number): Promise<TransformNode[]> {
	const container = await LoadAssetContainerAsync(file, scene);
	const roots: TransformNode[] = [];
	for (let index = 0; index < count; index++) {
		const entries = container.instantiateModelsToScene((name) => `${file}.${index}.${name}`, true, {
			doNotInstantiate: true,
		});
		const root = entries.rootNodes[0];
		if (!(root instanceof TransformNode)) {
			throw new Error(`The ${file} model is empty.`);
		}
		for (const mesh of childMeshes(root)) {
			tune(mesh.material);
			mesh.isPickable = false;
		}
		hideTemplate(root);
		roots.push(root);
	}
	return roots;
}

function spinRoot(scene: Scene, id: string, source: TransformNode): { spin: TransformNode; model: TransformNode } {
	const spin = new TransformNode(id, scene);
	spin.scaling.setAll(MODEL_SCALE);
	const facing = new TransformNode(`${id}.facing`, scene);
	facing.parent = spin;
	facing.rotation.y = FACE_INWARD;
	const model = replicate(source, facing, id);
	return { spin, model };
}

export async function loadFacilities(scene: Scene): Promise<FacilityKit> {
	const resources = Object.keys(ACCENT) as Mineral[];
	const mineRoots = await loadTemplates(scene, "/models/mine.glb", resources.length);
	const collectorRoots = await loadTemplates(scene, "/models/collector.glb", 1);
	const collector = collectorRoots[0];
	if (!collector) {
		throw new Error("The collector model is empty.");
	}
	dressCollector(collector);
	const mines = new Map<Mineral, TransformNode>();
	resources.forEach((resource, index) => {
		const root = mineRoots[index];
		if (!root) {
			throw new Error(`No mine model for ${resource}.`);
		}
		paintAccent(root, resource);
		mines.set(resource, root);
	});

	const place = (source: TransformNode, parent: TransformNode | null, id: string, boreName: string): Facility => {
		const { spin, model } = spinRoot(scene, id, source);
		spin.parent = parent;
		const borePivot = findNamed(model, boreName);
		const portPivot = requireNode(model, "PortPivot");
		const starboardPivot = requireNode(model, "StarboardPivot");
		// The replicated pivot is a fresh node, so the open angle is read off the template.
		const boreSource = findNamed(source, boreName);
		const portSource = requireNode(source, "PortPivot");
		const starboardSource = requireNode(source, "StarboardPivot");
		const bore = apertureOf(borePivot);
		const port = apertureOf(portPivot);
		const starboard = apertureOf(starboardPivot);
		if (bore && boreSource) {
			bore.openAngle = apertureOf(boreSource)?.openAngle ?? bore.openAngle;
		}
		if (port) {
			port.openAngle = apertureOf(portSource)?.openAngle ?? port.openAngle;
		}
		if (starboard) {
			starboard.openAngle = apertureOf(starboardSource)?.openAngle ?? starboard.openAngle;
		}
		if (!port || !starboard) {
			throw new Error(`The ${id} model is missing an access port.`);
		}
		return facilityOf(spin, borePivot, portPivot, starboardPivot, bore, port, starboard);
	};

	let swarmMesh: Mesh | null = null;
	return {
		placeMine(parent, id, resource) {
			const source = mines.get(resource);
			if (!source) {
				throw new Error(`No mine model for ${resource}.`);
			}
			return place(source, parent, id, "BorePivot");
		},
		collectorMesh() {
			if (swarmMesh) {
				return swarmMesh;
			}
			const meshes = childMeshes(collector).filter((mesh) => mesh.getTotalVertices() > 0);
			// The hull and the solar cap carry a texture. The collar and the irises do not, and a
			// join refuses mismatched attributes. A blank channel leaves those surfaces untextured.
			for (const mesh of meshes) {
				if (!mesh.isVerticesDataPresent(VertexBuffer.UVKind)) {
					mesh.setVerticesData(VertexBuffer.UVKind, new Float32Array(mesh.getTotalVertices() * 2));
				}
			}
			const merged = Mesh.MergeMeshes(meshes, false, true, undefined, false, true);
			if (!merged) {
				throw new Error("The collector could not be joined for the swarm.");
			}
			merged.name = "collector-swarm";
			merged.isPickable = false;
			merged.alwaysSelectAsActiveMesh = true;
			swarmMesh = merged;
			return merged;
		},
		liveCollector() {
			const facility = place(collector, null, "collector-docked", "BorePivot");
			facility.root.setEnabled(false);
			return facility;
		},
	};
}
