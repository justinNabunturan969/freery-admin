"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
/*
 * Leaflet's own stylesheet.
 *
 * It is not optional. Without it the panes are not positioned absolutely, so
 * the tiles, the markers and the controls fall into the normal flow of the
 * page: the map pane grows to the height of everything in it, the markers end
 * up below the map, and only a corner of the tiles is painted. The import is
 * at the top of the file on purpose: Next takes the CSS out at build time, so
 * nothing of it runs on the server.
 */
import "leaflet/dist/leaflet.css";

/**
 * The receiver on a map.
 *
 * The researchers connect a receiver and it appears here, with the trace it has
 * recorded so far. The picture is the one a running app draws: the path grows
 * as the positions arrive, and the receiver sits at the leading edge of it.
 *
 * Four things are drawn:
 *
 *   - the trace the receiver recorded, as a solid line
 *   - every position, as a dot whose colour says how far it was from the
 *     marked true position
 *   - the receiver itself, as a bigger dot at the front of the trace
 *   - the true position the researcher marked, as a crosshair, with the
 *     accuracy circles around it
 *
 * The other receivers that are reporting are shown as small dots, so it is
 * clear at a glance what is connected.
 *
 * Leaflet is loaded inside the browser only. It reaches for the window when it
 * is imported, and the page is rendered on the server as well.
 */

export interface MapFix {
  id: number;
  lat: number;
  lon: number;
  /** The distance from this position to the marked true position, in metres. */
  errorM: number | null;
  hdop: number | null;
  sats: number | null;
}

export interface MapReceiver {
  deviceId: string;
  lat: number;
  lon: number;
  /** True for the receiver that is on show. */
  current?: boolean;
}

export interface MapReference {
  lat: number;
  lon: number;
  label: string;
}

/** The bands the error is coloured by. */
export const ERROR_BANDS = [
  { label: "Within 2 m", max: 2, color: "#0E9F6E" },
  { label: "Within 5 m", max: 5, color: "#C2611C" },
  { label: "Over 5 m", max: Number.POSITIVE_INFINITY, color: "#C2453B" },
];

export function errorBandColor(errorM: number | null): string {
  if (errorM === null) return "#94A3B8";
  for (const band of ERROR_BANDS) {
    if (errorM <= band.max) return band.color;
  }
  return "#C2453B";
}

export function ReceiverMap({
  fixes,
  receiver,
  others = [],
  reference = null,
  cep50M = null,
  cep95M = null,
  follow = true,
  marking = false,
  focusRequest = 0,
  onFollowChange,
  onPick,
}: {
  fixes: MapFix[];
  /** The receiver on show, at its last reported position. */
  receiver: MapReceiver | null;
  /** The other receivers that are reporting. */
  others?: MapReceiver[];
  /** Where the researcher says the receiver really is. */
  reference?: MapReference | null;
  /** The radius that half of the positions are inside. */
  cep50M?: number | null;
  /** The radius that 95 per cent of the positions are inside. */
  cep95M?: number | null;
  follow?: boolean;
  /** True while the reader is marking the true position. */
  marking?: boolean;
  /** Raise this number to ask the map to fly to the true position. */
  focusRequest?: number;
  onFollowChange?: (follow: boolean) => void;
  /** Called with the place the reader clicked. */
  onPick?: (lat: number, lon: number) => void;
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const baseLayers = useRef<Leaflet.LayerGroup | null>(null);
  const trackLayers = useRef<Leaflet.LayerGroup | null>(null);
  /*
   * The receiver has a layer group of its own. The trace is drawn again every
   * time a position arrives and that wipes the track group clean, so a receiver
   * that shared the group would be wiped with it and never come back.
   */
  const receiverLayer = useRef<Leaflet.LayerGroup | null>(null);
  const receiverMarker = useRef<Leaflet.Marker | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const fitted = useRef(false);

  /* The map is made once. Leaflet cannot live outside the browser. */
  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!container.current || map.current) return;

      const L = (await import("leaflet")).default;
      if (cancelled || !container.current) return;

      leaflet.current = L;

      const instance = L.map(container.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
        /*
         * The measurement is in metres, so the map has to be able to show
         * metres. The tiles themselves only go to zoom 19, and Leaflet scales
         * them for the two levels above that. The trace, the dots and the
         * circles are drawn as vectors, so they stay sharp at any zoom.
         */
        maxZoom: 21,
      });
      map.current = instance;
      baseLayers.current = L.layerGroup().addTo(instance);
      trackLayers.current = L.layerGroup().addTo(instance);
      receiverLayer.current = L.layerGroup().addTo(instance);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 21,
        maxNativeZoom: 19,
      })
        .on("tileerror", () => setTilesFailed(true))
        .addTo(instance);

      L.control.scale({ imperial: false, metric: true }).addTo(instance);

      /*
       * The reader takes the map over by dragging it. The following stops
       * then, and the button to start it again appears.
       */
      instance.on("dragstart", () => onFollowChange?.(false));

      setReady(true);

      /*
       * The map lives in a card that reflows with the page, so the size of the
       * map has to be told to Leaflet again whenever the card changes width.
       */
      const observer = new ResizeObserver(() => instance.invalidateSize());
      observer.observe(container.current);
      observerRef.current = observer;
    }

    void start();

    return () => {
      cancelled = true;
      observerRef.current?.disconnect();
      observerRef.current = null;
      map.current?.remove();
      map.current = null;
      baseLayers.current = null;
      trackLayers.current = null;
      receiverLayer.current = null;
      receiverMarker.current = null;
    };
  }, []);

  /*
   * The true position and the other receivers. They change when the reader
   * marks the place or when another receiver starts reporting.
   */
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    const group = baseLayers.current;
    if (!L || !instance || !group || !ready) return;

    group.clearLayers();

    if (reference) {
      /* The crosshair on the true position. */
      L.marker([reference.lat, reference.lon], {
        icon: L.divIcon({
          className: "",
          html: `<span class="freery-map-reference" aria-label="${reference.label}"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        zIndexOffset: 700,
      })
        .bindTooltip(`The true position — ${reference.label}`)
        .addTo(group);

      /*
       * The accuracy circles.
       *
       * They are centred on the true position, which is how the GPS literature
       * draws them: the radius that contains 95 per cent of the estimates.
       */
      if (cep95M !== null && cep95M > 0) {
        L.circle([reference.lat, reference.lon], {
          radius: cep95M,
          color: "#C2453B",
          weight: 1,
          opacity: 0.6,
          fillColor: "#C2453B",
          fillOpacity: 0.08,
          dashArray: "4 4",
        })
          .bindTooltip(`95 per cent of the positions are inside ${cep95M.toFixed(1)} m`)
          .addTo(group);
      }

      if (cep50M !== null && cep50M > 0) {
        L.circle([reference.lat, reference.lon], {
          radius: cep50M,
          color: "#0E9F6E",
          weight: 1,
          opacity: 0.6,
          fillColor: "#0E9F6E",
          fillOpacity: 0.08,
          dashArray: "4 4",
        })
          .bindTooltip(`Half of the positions are inside ${cep50M.toFixed(1)} m`)
          .addTo(group);
      }
    }

    for (const other of others) {
      L.circleMarker([other.lat, other.lon], {
        radius: 5,
        color: "#ffffff",
        weight: 1,
        opacity: 0.9,
        fillColor: "#556274",
        fillOpacity: 1,
      })
        .bindTooltip(`${other.deviceId} — also reporting`)
        .addTo(group);
    }
  }, [reference, others, cep50M, cep95M, ready]);

  /*
   * The trace. It is drawn again whenever the positions change, which is every
   * time a packet arrives, so the line grows in front of the reader.
   */
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    const group = trackLayers.current;
    if (!L || !instance || !group || !ready) return;

    group.clearLayers();

    if (fixes.length > 1) {
      const line = fixes.map((fix) => [fix.lat, fix.lon] as [number, number]);

      /* A pale wide line under the trace, so it reads clearly over the tiles. */
      L.polyline(line, {
        color: "#ffffff",
        weight: 8,
        opacity: 0.55,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(group);

      L.polyline(line, {
        color: "#1D4ED8",
        weight: 4,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(group);
    }

    for (const fix of fixes) {
      const color = errorBandColor(fix.errorM);

      const marker = L.circleMarker([fix.lat, fix.lon], {
        radius: 4,
        color: "#ffffff",
        weight: 1,
        opacity: 0.9,
        fillColor: color,
        fillOpacity: 1,
      });
      marker.bindTooltip(
        `${fix.errorM === null ? "no measurement" : `${fix.errorM.toFixed(2)} m from the true position`}` +
          (fix.hdop !== null ? ` — HDOP ${fix.hdop.toFixed(2)}` : "") +
          (fix.sats !== null ? ` — ${fix.sats} satellites` : ""),
      );
      marker.addTo(group);
    }

    /*
     * The first view.
     *
     * The trace is what the reader came for, so the map opens on it. A
     * receiver standing still traces a couple of metres, and a view fitted to
     * that would be so deep that the reader would see nothing but a few
     * pixels, so the zoom is capped. When the true position is marked it is
     * in the view as well, because it is what the trace is measured against.
     *
     * The cap is the deepest zoom the map tiles have. The **Zoom to the true
     * position** button goes further, into the metres.
     */
    if (!fitted.current) {
      const places: [number, number][] = fixes.map(
        (fix) => [fix.lat, fix.lon] as [number, number],
      );
      if (reference) places.push([reference.lat, reference.lon]);

      if (places.length > 0) {
        instance.fitBounds(L.latLngBounds(places).pad(0.2), {
          maxZoom: 19,
        });
        fitted.current = true;
      }
    }
  }, [fixes, reference, ready]);

  /*
   * The receiver. It moves to the front of the trace, and the map follows it
   * unless the reader has taken the map over.
   */
  useEffect(() => {
    const L = leaflet.current;
    const instance = map.current;
    const layer = receiverLayer.current;
    if (!L || !instance || !layer || !ready) return;

    if (!receiver) {
      receiverMarker.current?.remove();
      receiverMarker.current = null;
      return;
    }

    if (!receiverMarker.current) {
      receiverMarker.current = L.marker([receiver.lat, receiver.lon], {
        icon: L.divIcon({
          className: "",
          html: `<span class="freery-map-receiver"></span>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        zIndexOffset: 500,
      })
        .bindTooltip(receiver.deviceId)
        .addTo(layer);
    } else {
      receiverMarker.current.setLatLng([receiver.lat, receiver.lon]);
      receiverMarker.current.setTooltipContent(receiver.deviceId);

      /* Belt and braces: if the marker was ever taken off the map, it goes
         back on it rather than staying invisible. */
      if (!layer.hasLayer(receiverMarker.current)) {
        layer.addLayer(receiverMarker.current);
      }
    }

    if (follow) {
      instance.panTo([receiver.lat, receiver.lon], { animate: true, duration: 0.6 });
    }
  }, [receiver, follow, ready]);

  /*
   * Marking the true position.
   *
   * While the reader is marking, a click on the map is the place they are
   * marking. The handler is registered on the map itself, so it works wherever
   * the reader clicks.
   */
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;

    const handler = (event: Leaflet.LeafletMouseEvent): void => {
      if (!marking) return;
      onPick?.(event.latlng.lat, event.latlng.lng);
    };

    instance.on("click", handler);
    return () => {
      instance.off("click", handler);
    };
  }, [marking, onPick, ready]);

  /*
   * Flying to the true position.
   *
   * The accuracy is a matter of metres, so the reader needs a view that shows
   * metres. This goes to the deepest zoom the map has, on the marked point,
   * or on the receiver when there is no mark yet.
   *
   * The place to fly to is kept in a ref, so the poll every three seconds
   * cannot set the map flying again and again.
   */
  const focusPlace = useRef<[number, number] | null>(null);
  focusPlace.current = reference
    ? [reference.lat, reference.lon]
    : receiver
      ? [receiver.lat, receiver.lon]
      : null;

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    if (focusRequest === 0) return;

    const place = focusPlace.current;
    if (!place) return;

    /* The reader asked to look at this place, so the map stops following the
       receiver, the way dragging it does. */
    onFollowChange?.(false);
    instance.flyTo(place, 21, { duration: 0.8 });
  }, [focusRequest, ready]);

  return (
    <div className="relative">
      <div
        ref={container}
        className="h-[340px] w-full overflow-hidden rounded-xl border border-line bg-[#eef1f3] sm:h-[420px] lg:h-[520px]"
        aria-label="The receiver on a map"
        role="img"
      />

      {tilesFailed ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg border border-[#f2ddc6] bg-[#fdf1e3]/95 px-3 py-2 text-xs text-[#8a430a]">
          The map tiles did not load, so this computer may be offline. The
          trace and the positions are still drawn.
        </div>
      ) : null}

      {marking ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg border border-brand-300 bg-brand-50/95 px-3 py-2 text-xs text-brand-900">
          Click the map where the receiver really is. That is the point every
          position is measured against.
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-[3px] w-6 rounded bg-[#1D4ED8]"
            aria-hidden="true"
          />
          The recorded trace
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="freery-map-reference relative inline-block" aria-hidden="true" />
          The true position
        </span>
        {ERROR_BANDS.map((band) => (
          <span key={band.label} className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: band.color }}
              aria-hidden="true"
            />
            {band.label}
          </span>
        ))}
      </div>
    </div>
  );
}
