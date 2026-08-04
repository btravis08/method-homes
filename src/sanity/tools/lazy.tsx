import { lazy, Suspense, type ComponentType } from "react";

/*
  Tool panes load lazily: each pane (and anything it imports — the
  bundled status JSON especially) becomes its own chunk, fetched when
  the tool is opened instead of parsed on the Studio's first load.
  First-load parse cost is what tips iOS Safari into killing the tab
  on cold visits, so every KB out of the entry chunk counts.
*/
export function lazyPane(load: () => Promise<{ default: ComponentType }>) {
  const Pane = lazy(load);
  return function LazyPane() {
    return (
      <Suspense fallback={null}>
        <Pane />
      </Suspense>
    );
  };
}
