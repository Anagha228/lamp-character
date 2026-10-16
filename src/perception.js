import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export class Perception {
  async start(video) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();

    const fileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );
    this.detector = await FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
      },
      runningMode: 'VIDEO',
    });
    this.video = video;
    this.lastTime = -1;
    this.last = { present: false, facing: false, yaw: 0, size: 0 };
  }

  // Call every frame. Returns the latest result.
  detect() {
    if (!this.detector || this.video.currentTime === this.lastTime) return this.last;
    this.lastTime = this.video.currentTime;

    const result = this.detector.detectForVideo(this.video, performance.now());
    const face = result.detections[0];
    if (!face) {
      this.last = { present: false, facing: false, yaw: 0, size: 0 };
      return this.last;
    }

    // Keypoint order: right eye, left eye, nose tip, mouth, right ear, left ear
    const [eyeA, eyeB, nose] = face.keypoints;
    const eyeDist = Math.abs(eyeA.x - eyeB.x);
    const mid = (eyeA.x + eyeB.x) / 2;
    const yaw = (nose.x - mid) / eyeDist;               // 0 = straight on
    const size = face.boundingBox.width / this.video.videoWidth;

    const facing = Math.abs(yaw) < YAW_LIMIT && size > MIN_SIZE;
    this.last = { present: true, facing, yaw, size };
    return this.last;
  }
}
const YAW_LIMIT = 0.35;   // how far the nose can drift from center
const MIN_SIZE = 0.10;    // ignore faces smaller than 10% of frame width (far away)