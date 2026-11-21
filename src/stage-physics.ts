type Slide = { x: number; velocity: number };
type Body = { slide: Slide; bounds: DOMRect; center: number; minX: number; maxX: number };

function separate(left: Body, right: Body) {
  if (left.bounds.bottom <= right.bounds.top || right.bounds.bottom <= left.bounds.top) return;
  const overlap = (left.bounds.width + right.bounds.width) / 2
    - (right.center + right.slide.x - left.center - left.slide.x);
  if (overlap <= 0) return;

  const leftRoom = left.slide.x - left.minX;
  const rightRoom = right.maxX - right.slide.x;
  const separation = Math.min(overlap, leftRoom + rightRoom);
  const leftPush = Math.max(separation - rightRoom, Math.min(separation / 2, leftRoom));
  left.slide.x -= leftPush;
  right.slide.x += separation - leftPush;

  const closingSpeed = Math.max(0, left.slide.velocity - right.slide.velocity);
  const kick = closingSpeed * .65 + Math.min(140, Math.max(0, separation - 1) * 12);
  if (left.slide.x > left.minX) left.slide.velocity -= kick;
  if (right.slide.x < right.maxX) right.slide.velocity += kick;
}

export function createStagePhysics() {
  const slides = new WeakMap<HTMLDivElement, Slide>();
  let previousTime = 0;

  return (actors: HTMLDivElement[], time: number, reducedMotion: boolean) => {
    const elapsed = Math.min(1 / 30, Math.max(0, time - previousTime));
    previousTime = time;
    if (reducedMotion) {
      for (const actor of actors) {
        if (slides.delete(actor)) actor.style.removeProperty('--slide');
      }
      return;
    }
    if (actors.length < 2 && !actors.some(actor => slides.has(actor))) return;

    const stage = actors[0].parentElement!.getBoundingClientRect();
    const bodies = actors.map(actor => {
      const bounds = actor.getBoundingClientRect();
      const slide = slides.get(actor) ?? { x: 0, velocity: 0 };
      const center = bounds.left + bounds.width / 2 - slide.x;
      const minX = stage.left - bounds.left + slide.x;
      const maxX = stage.right - bounds.right + slide.x;

      // A damped spring brings each performer back to the center of its sketch.
      slide.velocity = (slide.velocity - 30 * slide.x * elapsed) * Math.exp(-8 * elapsed);
      const nextX = slide.x + slide.velocity * elapsed;
      slide.x = Math.max(minX, Math.min(maxX, nextX));
      if (nextX !== slide.x) slide.velocity = 0;
      return { actor, slide, bounds, center, minX, maxX };
    });

    // A nudge can create a new contact in a group, so recheck the pairs after moving them.
    const ordered = [...bodies].sort((a, b) => a.center + a.slide.x - b.center - b.slide.x);
    for (let pass = 1; pass < ordered.length; pass++) {
      for (const [index, left] of ordered.entries()) {
        for (const right of ordered.slice(index + 1)) separate(left, right);
      }
    }

    for (const { actor, slide } of bodies) {
      if (Math.abs(slide.x) < .05 && Math.abs(slide.velocity) < .05) {
        if (slides.delete(actor)) actor.style.removeProperty('--slide');
      } else {
        slides.set(actor, slide);
        actor.style.setProperty('--slide', slide.x + 'px');
      }
    }
  };
}
