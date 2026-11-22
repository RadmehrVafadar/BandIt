import { BAR_STEPS, STEP_SECONDS } from './music.ts';
import type { Hit } from './music.ts';

export type Rhythms = Map<string, Hit[]>;

export class RhythmTake {
  readonly id: string;
  readonly hits: Hit[] = [];
  startedAt?: number;

  constructor(id: string) {
    this.id = id;
  }

  finished(time: number) {
    return this.startedAt !== undefined && time >= this.startedAt + BAR_STEPS * STEP_SECONDS;
  }

  addHit(time: number) {
    this.startedAt ??= time;
    if (this.finished(time)) return false;
    const step = Math.round((time - this.startedAt) / STEP_SECONDS) % BAR_STEPS;
    if (!this.hits.some(([at]) => at === step)) this.hits.push([step, 1]);
    return true;
  }
}
