# Object recognition

BandIt turns a sketch or a camera frame into an object with a name, artwork, and a sound.

## Why

Drawing suggestions need to follow each stroke and work without a network connection to a provider.
A camera can also capture objects outside the drawing model's vocabulary.

## How it works

### Sketches

The canvas records strokes relative to its size and converts them into a 28-by-28 grayscale image.
A browser worker runs DoodleNet on that image and returns up to eight ranked labels.
The drawing stays on the device.

The studio also compares strokes against templates for keys, drum, bell, cup, pencil, and whistle.
A close template match can take the first slot, and the six templates supply suggestions if the model fails to load.
Choosing a suggestion places its illustration where you drew and saves its position and size.

### Photos

Open an empty **+** slot, choose **Camera**, allow camera access, and select **Take photo**.
The studio sends that JPEG to `/api/identify`, which asks Gemini for the most prominent object.
An ambiguous name opens a choice in the studio.
For example, an animal mouse uses its illustration, while a computer mouse keeps the photo and plays a click.
Objects outside the illustrated set keep the photo and use a synthesized sound.

## Key files

- [Drawing](../src/Drawing.tsx) owns the strokes, fallback matching, and suggestion strip.
- [DoodleNet worker](../src/doodle.worker.ts) scores the image against the [ordered labels](../src/doodle-labels.json).
- [Sketch templates](../src/sketch.ts) rank the six basic instruments.
- [Object labels](../src/object-labels.ts) keeps photo meanings consistent across the studio and API.
- [Camera capture](../src/CameraCapture.tsx) submits the frame to the [identification handler](../server/identify.ts).

## Decisions and gotchas

Keep the label array in model output order because each index names one prediction.
The camera requires HTTPS or localhost and a Gemini key supplied by the site or signed-in player.

## Credits

Yining Shi trained DoodleNet on Google's Quick, Draw! dataset (CC BY 4.0).
The bundled weights and label order come from ml5. [DoodleNet](https://github.com/yining1023/doodleNet) · [Quick, Draw!](https://github.com/googlecreativelab/quickdraw-dataset) · [Model distribution](https://github.com/ml5js/ml5-data-and-models/tree/main/models/doodlenet) · [Bundled license](../public/doodlenet/LICENSE)

Most illustrations credit their AutoDraw stencil inside the SVG.
BandIt supplies the church, face, knife, lighter, rifle, and zigzag drawings. [AutoDraw artists](https://www.autodraw.com/artists)

## Related

- [Object sounds](sounds.md)
- [Sign-in and provider keys](authentication.md)
