import { POSES } from './poses.js';
import { aimAt } from './robot.js';

const PERSONA =
    'You are a small, curious desk lamp with a warm, happy and cheerful personality. ' +
    'Reply in one or two short spoken sentences. No markdown, no lists, no emojis. ' +
    'Facts about you: you have a head that can tilt and turn, and a light, but in ordinary ' +
    'conversation you cannot choose to move or change your light, so never say you just moved, ' +
    'adjusted, or brightened anything. You cannot see right now unless you are given a picture. ' +
    'Never invent objects, books, or details about the room or the person. ' +
    'If asked to point or shine your light at something, say you can, and ask them to name the object, like "point at the mug". ' +
    'If you do not know something, say so briefly.';

// Phrases that mean "look at what I'm showing you".
const LOOK_REQUEST = /\b(look at (this|that|it)|remember (this|that)|what('s| is) this|what this is|what am i (holding|showing)|can you see (this|that)|take a look)\b/i;

const OBSERVE_PROMPT =
    'Look at the image. Identify the single main object the person is holding up or showing ' +
    '(if none, the most prominent object other than the person). Return JSON with keys: ' +
    'object (short noun phrase), color (main color), details (one short sentence of useful ' +
    'visible details such as text, logo, or size), position (where in the frame, e.g. "center" ' +
    'or "upper left"), confidence (0 to 1). If there is no clear object, return {"object": null}.';


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitSettled(body, timeout = 3000) {
  const t0 = performance.now();
  while (!body.settled() && performance.now() - t0 < timeout) await sleep(50);
}

const GOAL_REQUEST = /\b(shine|point|aim|turn|look)\b.*\b(on|at|toward|towards|to)\b/i;  

const PLAN_PROMPT = (goal) =>
    `The person said: "${goal}". Look at the image and plan what the lamp should do. ` +
    'You may only use these actions: ' +
    '{"action":"aim","x":0-1,"y":0-1} turns the lamp toward a spot in the image (x: 0 is the left edge, 1 the right edge; y: 0 is the top, 1 the bottom), ' +
    '{"action":"light","mode":"dim"|"normal"|"bright"|"spot"} sets the light, ' +
    '{"action":"wait","seconds":0-3} holds still. ' +
    'Return JSON like {"found":true,"label":"short name of the target","steps":[...]} with at most 4 steps. ' +
    'If the thing the person mentioned is not visible, return {"found":false}.';

const LIGHT_MODES = {
    dim:    { color: '#ffd9a0', intensity: 20,  angle: 0.7 },
    normal: { color: '#fff1c9', intensity: 60,  angle: 0.7 },
    bright: { color: '#ffffff', intensity: 120, angle: 0.7 },
    spot:   { color: '#fff4d6', intensity: 160, angle: 0.25 },
};

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v)));

// Timers 
const T = {
    NOTICE_MS: 300,      // attention held this long -> NOTICED
    GREET_MS: 1000,      // attention held this long -> GREETING
    NOTICE_LOSE_MS: 1500,// attention lost this long while NOTICED -> back to IDLE
    LOSE_MS: 2500,       // attention lost this long while engaged -> DISENGAGED
    GREETING_LEN_MS: 1800,
    DISENGAGE_LEN_MS: 3000,
};

function parseJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON in reply: ' + text);
  return JSON.parse(cleaned.slice(start, end + 1));
}

export class Character {
    constructor(body, play, sound, voice, getFrame) {
        this.body = body;
        this.play = play;
        this.sound = sound;
        this.voice = voice;
        this.getFrame = getFrame;
        this.memory = [];
        this.state = null;
        this.metrics = [];
        this.enteredAt = 0;
        this.attending = false;
        this.attendSince = 0;
        this.lostSince = 0;
        this.history = [];
        this.turnId = 0;
        this.enter('IDLE', performance.now());
    }

    // Perception calls this. For now the keyboard does.
    setAttention(attending, now = performance.now()) {
        if (attending && !this.attending) this.attendSince = now;
        if (!attending && this.attending) this.lostSince = now;
        this.attending = attending;
    }

    // Call every frame.
    update(now) {
        const inState = now - this.enteredAt;
        const attendedFor = this.attending ? now - this.attendSince : 0;
        const lostFor = !this.attending ? now - this.lostSince : 0;

        switch (this.state) {
        case 'IDLE':
            if (attendedFor >= T.NOTICE_MS) this.enter('NOTICED', now);
            break;

        case 'NOTICED':
            if (attendedFor >= T.GREET_MS) this.enter('GREETING', now);
            else if (lostFor >= T.NOTICE_LOSE_MS) this.enter('IDLE', now);
            break;

        case 'GREETING':
            if (lostFor >= T.LOSE_MS) this.enter('DISENGAGED', now);
            else if (inState >= T.GREETING_LEN_MS) this.enter('LISTENING', now);
            break;

        case 'LISTENING':
            if (lostFor >= T.LOSE_MS) this.enter('DISENGAGED', now);
            break;

        case 'DISENGAGED':
            if (attendedFor >= T.NOTICE_MS) this.enter('NOTICED', now);
            else if (inState >= T.DISENGAGE_LEN_MS) this.enter('IDLE', now);
            break;
        }
    }

    enter(state, now) {
        console.log(`${this.state} -> ${state}`);
        if (state !== 'LISTENING') this.voice?.stopListening();
        this.state = state;
        this.enteredAt = now;
        this.onEnter[state]?.call(this);
    }

    startListening() {
        console.log('startListening called, speech supported:', this.voice.supported);
        const id = ++this.turnId;
        this.voice.listen().then((text) => {
        console.log('heard:', JSON.stringify(text));
        this.heardAt = performance.now();
        if (id !== this.turnId || this.state !== 'LISTENING') return;   // stale
        if (text) this.respond(text);
        else this.startListening();                                     // heard nothing, keep listening
        }).catch((err) => console.error('mic failed:', err.message));
    }

    async respond(text) {
        if (LOOK_REQUEST.test(text)) return this.observe(text);
        if (GOAL_REQUEST.test(text)) return this.pursueGoal(text);
        this.kind = 'chat';
        this.enter('THINKING', performance.now());
        this.history.push({ role: 'user', text });
        let reply;
        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system: PERSONA + this.memoryNote(), messages: this.history }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            reply = data.text.trim();
            console.log(`reply in ${data.ms} ms: ${reply}`);
        } catch (err) {
            console.error(err);
            reply = 'Sorry, I lost my train of thought.';
        }
        await this.say(reply);
    }

    memoryNote() {
        if (!this.memory.length) return '';
            const lines = this.memory.map((m) => {
            const mins = Math.round((Date.now() - m.time) / 60000);
            return `- ${m.object} (${m.color}). ${m.details} Position: ${m.position}. Seen ${mins} min ago.`;
        });
        return (
            '\nThings you have looked at through your camera. This is your only knowledge of ' +
            'the scene, so answer questions about them from this list and nothing else:\n' + lines.join('\n')
        );
    }

    async say(reply) {
        this.history.push({ role: 'model', text: reply });
        this.enter('SPEAKING', performance.now());
        await this.voice.speak(reply, () =>{
            const ms = Math.round(performance.now() - this.heardAt);
            this.metrics.push({ kind: this.kind, ms });
            console.log(`latency (${this.kind}): ${ms} ms`);
        });
        if (this.state === 'SPEAKING') this.enter('LISTENING', performance.now());
    }

    async observe(text) {
        this.enter('LOOKING', performance.now());
        this.history.push({ role: 'user', text });
        await new Promise((r) => setTimeout(r, 700));      // person holds still, pose lands
        const image = this.getFrame();
        this.sound.shutter();
        let reply;
        try {
            const res = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                system: 'You describe objects for a lamp robot. Respond only with JSON.',
                messages: [{ role: 'user', text: OBSERVE_PROMPT }],
                image,
                json: true,
                }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const item = parseJson(data.text);
            console.log(`observed in ${data.ms} ms:`, item);
            if (!item.object) {
                reply = "I looked, but I couldn't make out an object. Could you hold it a little closer?";
            } else {
                this.memory.push({ ...item, time: Date.now() });
                reply = `Okay, I see ${[item.color, item.object].filter(Boolean).join(' ')}. I will remember it.`;
            }
        } catch (err) {
            console.error(err);
            reply = 'Sorry, I could not get a good look.';
        }
        await this.say(reply);
    }

    async planGoal(goal) {
        const res = await fetch('/api/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system: 'You plan actions for a lamp robot. Respond only with JSON.' + this.memoryNote(),
                messages: [{ role: 'user', text: PLAN_PROMPT(goal) }],
                image: this.getFrame(),
                json: true,
            }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
            console.log(`plan in ${data.ms} ms:`, data.text);
        return parseJson(data.text);
    }

    // The body only runs steps from the menu. Anything else is ignored.
    async runStep(step) {
        if (step.action === 'aim') {
            this.body.setPose(aimAt(clamp01(step.x), clamp01(step.y)));
            await waitSettled(this.body);
        } else if (step.action === 'light' && LIGHT_MODES[step.mode]) {
            const m = LIGHT_MODES[step.mode];
            this.body.setLight(m.color, m.intensity);
            this.body.light.angle = m.angle;
            await sleep(400);
        } else if (step.action === 'wait') {
            await sleep(Math.min(3, Math.max(0, Number(step.seconds) || 0)) * 1000);
        } else {
            console.warn('ignored step:', step);
        }
    }

    async pursueGoal(text) {
        this.enter('GOAL', performance.now());
        this.history.push({ role: 'user', text });
        let reply;
        try {
            const plan = await this.planGoal(text);
            if (!plan.found || !Array.isArray(plan.steps)) {
                reply = "I can't see that right now.";
            } else {
                for (const step of plan.steps.slice(0, 4)) {
                this.sound.blip(780);
                await this.runStep(step);
                }
                reply = `Okay, I did that with the ${plan.label}.`;   // Piece C will make this check first
            }
        } catch (err) {
            console.error(err);
            reply = 'Sorry, I could not work that out.';
        }
        await this.say(reply);
    }

    // What the body does when a state starts. Light colors and intensities, and sound.
    onEnter = {
        IDLE() {
            this.body.setLight('#ffd9a0', 20);
            this.play([
                { pose: POSES.SCAN_LEFT, ms: 2500 },
                { pose: POSES.REST, ms: 1200 },
                { pose: POSES.SCAN_RIGHT, ms: 2500 },
                { pose: POSES.REST, ms: 1200 },
            ], { loop: true });
            this.sound.stopMusic();
        },

        NOTICED() {
            this.body.setLight('#f9ffb8', 50);
            this.play([
                { pose: POSES.NOTICE_UP, ms: 1300 },
                { pose: POSES.NOTICE_NOD, ms: 1300 },
                { pose: POSES.NOTICE_UP, ms: 1300 },
            ]);
            this.sound.chime();
        },

        GREETING() {
            this.body.setLight('#ffd9a0', 50);
            this.play([
                { pose: POSES.BOUNCE_UP, ms: 450 },
                { pose: POSES.BOUNCE_DOWN, ms: 420 },
                { pose: POSES.BOUNCE_UP, ms: 420 },
                { pose: POSES.BOUNCE_DOWN, ms: 420 },
                { pose: POSES.BOUNCE_UP, ms: 420 },
                { pose: POSES.BOUNCE_DOWN, ms: 420 },
            ], { loop: true });
            this.sound.jingle();
            this.sound.startMusic();
        },

        LISTENING() {
            this.body.setLight('#c7feff', 30);
            this.play([{ pose: POSES.LISTEN, ms: 0 }]);
            this.sound.setMusicLevel(0.35);
            this.startListening();
            this.body.light.angle = 0.7;
        },

        THINKING() {
            this.body.setLight('#ffb347', 30);
            this.sound.blip();
            this.play([
                { pose: POSES.THINK, ms: 700 },
                { pose: POSES.LISTEN, ms: 700 },
            ], { loop: true });
        },

        SPEAKING() {
            this.body.setLight('#fff1c9', 50);
            this.sound.setMusicLevel(0.2);
            this.play([
                { pose: POSES.SPEAK_A, ms: 450 },
                { pose: POSES.SPEAK_B, ms: 450 },
            ], { loop: true });
        },

        LOOKING() {
            this.body.setLight('#ffffff', 120);        // bright flash like a camera
            this.play([{ pose: POSES.LOOK_OBJECT, ms: 0 }]);
            this.sound.setMusicLevel(0.2);
        },

        GOAL() {
            this.sound.setMusicLevel(0.2);
            this.play([{ pose: POSES.LISTEN, ms: 0 }]);   // hold still while planning
        },

        DISENGAGED() {
            this.body.setLight('#c3cefe', 20);
            this.play([
                { pose: POSES.DROOP, ms: 2800 },
            ], { loop: true });
            this.sound.stopMusic();
        },
    };
}