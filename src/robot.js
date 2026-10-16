import * as THREE from 'three';

// Copied from the URDF (urdf-loader does not read the safety_controller block).
const LIMITS = {
  base_yaw_joint:       { lo: -2.45, hi: 2.45, vmax: 1.50 },
  shoulder_pitch_joint: { lo: -0.65, hi: 0.95, vmax: 0.95 },
  elbow_pitch_joint:    { lo: -1.70, hi: 0.30, vmax: 1.15 },
  neck_yaw_joint:       { lo: -1.25, hi: 1.25, vmax: 1.60 },
  head_pitch_joint:     { lo: -0.80, hi: 0.60, vmax: 1.45 },
};

// x and y are positions in the camera picture: 0 to 1, where 0,0 is the top-left corner.
const HFOV = 1.1;       // how wide the webcam sees, in radians (a guess)
const YAW_SIGN = -1;     // change to -1 if the lamp turns the wrong way left/right
const PITCH_SIGN = 1;   // change to -1 if it tips the wrong way up/down

export class LampBody {
  constructor(robot) {
    this.robot = robot;
    this.target = {};
    this.current = {};
    for (const name of Object.keys(LIMITS)) {
      this.target[name] = 0;
      this.current[name] = 0;
    }

    // Light: a spotlight on the emitter frame, pointing out of the shade (+x).
    const emitter = robot.links['light_emitter_link'];
    this.light = new THREE.SpotLight(0xffe2a8, 0, 4, 0.7, 0.6);
    const aim = new THREE.Object3D();
    aim.position.set(1, 0, 0);
    emitter.add(this.light, aim);
    this.light.target = aim;

    this.glow = [];
    robot.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === 'fixture_light') this.glow.push(o.material);
    });
    console.log('glow materials found:', this.glow.length);
  }

  // Set where we want to go. Clamped to soft limits.
  setPose(pose) {
    for (const [name, value] of Object.entries(pose)) {
      const l = LIMITS[name];
      this.target[name] = Math.min(l.hi, Math.max(l.lo, value));
    }
  }

  setLight(color, intensity) {
    this.light.color.set(color);
    this.light.intensity = intensity;
    for (const m of this.glow) {
      m.emissive.set(color);
      m.emissiveIntensity = Math.min(intensity / 30, 1.5);
    }
  }
  // Call every frame with dt in seconds.
  update(dt) {
    for (const name of Object.keys(LIMITS)) {
      const { vmax } = LIMITS[name];
      const error = this.target[name] - this.current[name];
      // ease toward the target, but never faster than 80% of the URDF max speed
      const speed = Math.max(-vmax * 0.8, Math.min(vmax * 0.8, error * 6));
      this.current[name] += speed * dt;
      this.robot.setJointValue(name, this.current[name]);
    }
  }

  settled(eps = 0.03) {
    return Object.keys(LIMITS).every((n) => Math.abs(this.target[n] - this.current[n]) < eps);
  }
}

// reach: positive = leaning toward the direction the shade faces
export function armPose(lowerReach, upperReach) {
  return {
    shoulder_pitch_joint: -lowerReach,
    elbow_pitch_joint: -(upperReach - lowerReach),
  };
}

export function aimAt(x, y) {
  return {
    base_yaw_joint: YAW_SIGN * (x - 0.5) * HFOV,
    ...armPose(0.3, 0.7),
    neck_yaw_joint: 0,
    head_pitch_joint: 0.2 + PITCH_SIGN * (y - 0.5) * (HFOV * 0.75),
  };
}

