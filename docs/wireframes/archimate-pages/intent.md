# ArchiMate pages: as-is intent

**Covers:** every visualiser declared with `renderedBy: archimate-pages`, in any layer (`coversRenderedBy` in `../index.json`). For example, dth-sc's and dth-phc's `archimate` visualisers, routed at `en/<layer>/archimate/`. The pages are written by `archimate/scripts/gen-archimate-pages.ts` from the layer's `archimate/` directory, one folder per model version.

**Candidates:** both are drawn from dth-sc's overlay 0.1.0-draft.1, as a real example. `as-is.html` is a model's version page, which the models index links to. `as-is-view.html` is one view's page (dth-sc Fig. 17). Both are checked at web 1280 and mobile 390.

**Who it is for:** a reader of a handbook who meets one of its architecture figures and wants the model behind it, and an author linking a block to an ArchiMate element or view.

**What they need to do:** find a model's views, open one, see which elements it holds, and follow an element to its own page and to the reference-architecture element it copies.

**What it must show:**

On the models index (`archimate/`):
- each model version, linked, with its counts of views and elements.

On a version page:
- a link back to the models index, the model's title and version;
- the metamodel in use, and the counts (views, elements, relationships), with the contents by layer;
- the model's description;
- the views, each linked;
- the elements, grouped by layer, each linked with its ArchiMate type.

On a view's page:
- a link back to the version page, and the view's title;
- the drawing;
- the view's documentation;
- the elements in the view, each linked with its type;
- links to the view's JSON-LD and to the drawing as SVG.

The pages load their content from the model's JSON-LD, so without JavaScript they say that they need it.
