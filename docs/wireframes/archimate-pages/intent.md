# archimate/ pages: as-is intent

**Covers:** every visualiser declared with `renderedBy: archimate-pages`, in
whichever layer declares it: smart-ra's `dpi-h-ra/archimate`, and each DTH's
`<dth>/archimate` (`dth-hrh/archimate`, `dth-phc/archimate`, `dth-sfp/archimate`, …).
`index.json` names them by renderer, `renderedBy:archimate-pages`, so one
wireframe covers the page kind across instances and a new DTH needs no edit
(owner, 2026-11-17, option b). All of them are written by one writer,
`archimate/scripts/gen-archimate-pages.ts` (Tool `archimate-pages`), routed at
`en/<instance>/archimate/`, and gated by `check:archimate`.

**Candidates:** `as-is.html` is a model's page (`<instance>/archimate/<model>/`),
and `as-is-view.html` is one view's page (`…/<model>/view/<view>/`). Both are
drawn from dth-hrh's `0.1.0-draft.1` overlay as built on 2026-11-17, and both
are checked at web 1280 and mobile 390. The route's own index, a list of
models with their view and element counts, is a single list and is not drawn
separately. Element and relationship pages share the model page's layout: a
heading, the node's declaration, and links.

**Who it is for:** a reader of a DTH or of the DPI-H reference architecture
who meets an ArchiMate element named in the text (a block's `meta.archimate`)
and wants to see where it sits; an architect checking what a DTH's overlay
adds to smart-ra; an agent resolving an element's IRI.

**What they need to do:** find a model's views and elements, open a view as a
drawing, read the drawing (the key says what each colour, shape and line
means), go from a box in the drawing to the element's own page, and get the
data (JSON-LD, the Archi model file, the SVG).

**What it must show:**

On a model's page:
- a link back to the list of models;
- the model's name and version, a link to the metamodel in use, and the counts
  (views, elements, relationships);
- the model's documentation;
- a contents box linking the Views section and each ArchiMate layer present,
  with the layer's element count;
- the views, each linked;
- one section per layer (Strategy, Business, Application, Technology,
  Motivation, …), each element linked by name with its type after it;
- links to the node as JSON-LD and to the Archi model file.

On a view's page:
- a link back to the model;
- the view's name, and where the document draws it (figure id and block file)
  when a block names it;
- the view's documentation;
- the drawing, with its title band and its key (colours, shapes, other marks,
  lines), scaled to the width;
- every element in the view, linked, with its type;
- links to the node as JSON-LD and to the drawing as SVG.

## Observed

At 390 px the drawing is scaled down to the width and its labels are too small
to read; the reader opens the SVG link to zoom. The element lists drop from
three or four columns to one.
