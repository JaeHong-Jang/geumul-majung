# Third-party notices

## Leaflet 1.9.4

`vendor/leaflet.js` and `vendor/leaflet.css` are reused from
`origin/디벨롭_hy:carrier-app/vendor/`.

Copyright © 2010–2023 Volodymyr Agafonkin and © 2010–2011 CloudMade.
Licensed under the BSD 2-Clause License. The complete license is retained in
[`vendor/LICENSE-Leaflet.txt`](vendor/LICENSE-Leaflet.txt).
Upstream: <https://leafletjs.com/>;
license source: <https://github.com/Leaflet/Leaflet/blob/v1.9.4/LICENSE>.

## OpenStreetMap

The PNG files under `assets/maps/` are a subset of the existing offline tile
bundle at `origin/디벨롭_hy:carrier-app/data/tiles.js`. No new tile download is
performed by this prototype. Tiles at zooms 8–10 cover the existing regional
overview; zooms 11–13 are limited to the Gumi/Chilgok demonstration area.
There are 308 tiles, approximately 6.93 MiB in total. Outside detailed local
coverage, the map enlarges an existing overview tile without a network fallback.

Map data © OpenStreetMap contributors, available under the
[Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Attribution is displayed on the map and links to
<https://www.openstreetmap.org/copyright>.

`src/routes.json` retains only the depot, demonstration stop coordinates and
the 11 precomputed road polylines from `janjaemi-app/assets/carrier/orders.json`.
The full factory coordinate corpus and the road graph are not redistributed.
The route data is a static demonstration snapshot; it does not account for
current traffic or provide turn-by-turn navigation.

## Noto Sans KR

`assets/fonts/NotoSansKR-Variable.ttf` and its license are reused from
`janjaemi-app/assets/fonts/`.
Copyright 2014–2021 Adobe (<http://www.adobe.com/>), with Reserved Font Name
“Source”. Licensed under the SIL Open Font License, Version 1.1.
The complete original notice is retained in
[`assets/fonts/OFL-NotoSansKR.txt`](assets/fonts/OFL-NotoSansKR.txt).
