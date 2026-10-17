import * as THREE from 'three'
import { paletteColor } from './palette'

type Vec3 = [number, number, number]

/** The `view` object the demo builders expect (box/material/line), with every color mapped onto the token palette. */
export class DemoViewAdapter {
  private materials = new Map<string, THREE.MeshStandardMaterial>()

  material(color: number, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const mapped = paletteColor(color)
    const emissive = typeof options.emissive === 'number' ? paletteColor(options.emissive) : undefined
    const key = `${mapped}-${JSON.stringify({ ...options, emissive })}`
    const cached = this.materials.get(key)
    if (cached) return cached
    const created = new THREE.MeshStandardMaterial({ roughness: 0.85, ...options, color: mapped, ...(emissive === undefined ? {} : { emissive }) })
    this.materials.set(key, created)
    return created
  }

  box(parent: THREE.Object3D, size: Vec3, pos: Vec3, color: number, options?: THREE.MeshStandardMaterialParameters): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.material(color, options))
    mesh.position.set(...pos)
    parent.add(mesh)
    return mesh
  }

  line(parent: THREE.Object3D, points: Vec3[], color: number, opacity = 1): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)))
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: paletteColor(color), transparent: opacity < 1, opacity }))
    parent.add(line)
    return line
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose()
    this.materials.clear()
  }
}
