import { armPose } from './robot.js';

// Rule of thumb for armPose(lower, upper):
// upper - lower is how much the elbow folds. It must stay between -0.3 and 1.7.
// head_pitch: I believe positive tips the shade DOWN. If it looks backwards, flip the signs.

export const POSES = {
  // Calm default, slight lean toward the viewer, head a little down
  REST:        { base_yaw_joint: 0,    ...armPose(0.1, 0.7),  neck_yaw_joint: 0,    head_pitch_joint: 0.15 },

  // IDLE scan: same arm, base turns left and right
  SCAN_LEFT:   { base_yaw_joint: 0.8,  ...armPose(0.1, 0.5),  neck_yaw_joint: 0,    head_pitch_joint: 0.1 },
  SCAN_RIGHT:  { base_yaw_joint: -0.8, ...armPose(0.1, 0.5),  neck_yaw_joint: 0,    head_pitch_joint: 0.1 },

  // NOTICED: sit up tall and tip the head up, like "oh!"
  NOTICE_UP:   { base_yaw_joint: 0,    ...armPose(-0.1, 0.1), neck_yaw_joint: 0,    head_pitch_joint: -0.35 },
  NOTICE_NOD:  { base_yaw_joint: 0,    ...armPose(0.0, 0.3),  neck_yaw_joint: 0,    head_pitch_joint: 0.3 },

  // GREETING bounce: alternate DOWN and UP, with the neck wiggling
  BOUNCE_DOWN: { base_yaw_joint: 0,    ...armPose(0.35, 0.9), neck_yaw_joint: 0.4,  head_pitch_joint: 0.35 },
  BOUNCE_UP:   { base_yaw_joint: 0,    ...armPose(0.0, 0.2),  neck_yaw_joint: -0.4, head_pitch_joint: -0.35 },

  // LISTENING: lean in, very still, face centered
  LISTEN:      { base_yaw_joint: 0,    ...armPose(0.2, 0.8),  neck_yaw_joint: 0,    head_pitch_joint: -0.3 },

  // THINKING: head tilted to the side, a bit upward, like pondering
  THINK:       { base_yaw_joint: 0,    ...armPose(0.15, 0.45), neck_yaw_joint: 0.5, head_pitch_joint: -0.2 },

  // SPEAKING: two small nods that alternate
  SPEAK_A:     { base_yaw_joint: 0,    ...armPose(0.3, 0.7),  neck_yaw_joint: 0,    head_pitch_joint: 0.1 },
  SPEAK_B:     { base_yaw_joint: 0,    ...armPose(0.3, 0.7),  neck_yaw_joint: 0,    head_pitch_joint: 0.28 },

  // LOOKING_AT_OBJECT: lean over and dip the head toward the table
  LOOK_OBJECT: { base_yaw_joint: 0,    ...armPose(0.45, 1.0), neck_yaw_joint: 0,    head_pitch_joint: 0.45 },

  // DISENGAGED: droop back and lower the head
  DROOP:       { base_yaw_joint: 0,    ...armPose(-0.3, 0.0), neck_yaw_joint: 0.2,  head_pitch_joint: 0.5 },
};